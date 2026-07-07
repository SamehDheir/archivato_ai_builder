import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  type ApiDesign,
  type ApiEndpoint,
  type ApiModule,
  type DatabaseDesign,
  type Entity,
  type IntentAnalysis,
  type RequirementDocument,
  type SchemaField,
  type SystemDesign,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** What the API Designer needs from upstream stages. */
export interface ApiDesignContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
}

/** Columns that are managed by the server, never sent in a request body. */
const SERVER_MANAGED = new Set([
  'id',
  'created_at',
  'updated_at',
  'password_hash',
]);

/**
 * Owns the API Design stage: REST endpoints grouped by module, each with method,
 * request/response schemas, and status codes. LLM-driven with a deterministic
 * fallback that derives CRUD endpoints from the database entities.
 */
@Injectable()
export class ApiDesignerAgent extends BaseAgent {
  readonly role = AgentRole.ApiDesigner;

  private readonly logger = new Logger(ApiDesignerAgent.name);

  protected readonly systemPrompt = [
    'You are a precise API Designer who turns a data model and service breakdown',
    'into a clean, RESTful HTTP contract a frontend and backend team can build',
    'against without further clarification.',
    'Method: group endpoints by resource/module; use noun-based, pluralized,',
    'lowercase paths (/api/orders, /api/orders/:id) and the correct HTTP verb',
    '(GET read, POST create, PUT/PATCH update, DELETE remove). List endpoints',
    'expose page/limit pagination. Request schemas exclude server-managed fields',
    '(id, timestamps, password_hash); response schemas reflect what is actually',
    'returned. Every endpoint declares realistic status codes including its error',
    'cases (400 validation, 401/403 auth, 404 not found, 409 conflict).',
    'Output standard: paths, methods, and schemas are internally consistent with',
    'the entities and services, field names match the data model, and there are no',
    'placeholder or duplicated endpoints. Return ONLY strict JSON matching the',
    'schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: ApiDesignContext,
  ): Promise<ApiDesign> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<ApiDesign>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return { ...(raw as ApiDesign), sessionId, generatedAt };
      }
      this.logger.debug('API design malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`API design failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: ApiDesignContext): string {
    const entities = ctx.databaseDesign.entities
      .map(
        (e) =>
          `- ${e.name}: ${e.columns
            .map((c) => c.name)
            .slice(0, 10)
            .join(', ')}`,
      )
      .join('\n');
    return [
      `Idea: ${ctx.idea}`,
      `Services: ${ctx.systemDesign.services.map((s) => s.name).join(', ')}`,
      'Entities and their columns (design CRUD + relevant actions per entity):',
      entities,
      '',
      'Design the HTTP API and return JSON with this key:',
      '- modules[]: {name, basePath (e.g. /api/orders), endpoints[]}.',
      '  Each endpoint: {method (GET|POST|PUT|PATCH|DELETE), path, summary (what it does), requestSchema[] {name, type, required (boolean)}, responseSchema[] {name, type, required (boolean)}, statusCodes[] (integers incl. error cases)}.',
      'Include an Auth module (register/login/refresh) and full CRUD per entity; add page/limit to list endpoints; omit server-managed fields (id, created_at, updated_at, password_hash) from request bodies.',
    ].join('\n');
  }

  private isValid(value: Partial<ApiDesign> | null): boolean {
    return (
      !!value &&
      Array.isArray(value.modules) &&
      value.modules.length > 0 &&
      value.modules.every((m) => Array.isArray(m.endpoints))
    );
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: ApiDesignContext,
  ): ApiDesign {
    const modules: ApiModule[] = [authModule()];

    for (const entity of ctx.databaseDesign.entities) {
      modules.push(crudModule(entity));
    }

    return { sessionId, generatedAt, modules };
  }
}

// ── deterministic helpers ─────────────────────────────────────────────────

function authModule(): ApiModule {
  const credentials: SchemaField[] = [
    { name: 'email', type: 'string', required: true },
    { name: 'password', type: 'string', required: true },
  ];
  const tokenResponse: SchemaField[] = [
    { name: 'accessToken', type: 'string', required: true },
    { name: 'refreshToken', type: 'string', required: true },
  ];
  return {
    name: 'Auth',
    basePath: '/api/auth',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/register',
        summary: 'Register a new user account.',
        requestSchema: credentials,
        responseSchema: tokenResponse,
        statusCodes: [201, 400, 409],
      },
      {
        method: 'POST',
        path: '/api/auth/login',
        summary: 'Authenticate and receive tokens.',
        requestSchema: credentials,
        responseSchema: tokenResponse,
        statusCodes: [200, 400, 401],
      },
      {
        method: 'POST',
        path: '/api/auth/refresh',
        summary: 'Exchange a refresh token for a new access token.',
        requestSchema: [
          { name: 'refreshToken', type: 'string', required: true },
        ],
        responseSchema: tokenResponse,
        statusCodes: [200, 401],
      },
    ],
  };
}

function crudModule(entity: Entity): ApiModule {
  const resource = entity.name; // already plural table name
  const basePath = `/api/${resource}`;
  const moduleName = capitalize(resource);

  const responseSchema: SchemaField[] = entity.columns.map((c) => ({
    name: c.name,
    type: c.type,
    required: !c.nullable,
  }));

  const writeSchema: SchemaField[] = entity.columns
    .filter((c) => !SERVER_MANAGED.has(c.name))
    .map((c) => ({ name: c.name, type: c.type, required: !c.nullable }));

  return {
    name: moduleName,
    basePath,
    endpoints: [
      {
        method: 'GET',
        path: basePath,
        summary: `List ${resource}.`,
        requestSchema: [
          { name: 'page', type: 'integer', required: false },
          { name: 'limit', type: 'integer', required: false },
        ],
        responseSchema,
        statusCodes: [200],
      },
      {
        method: 'POST',
        path: basePath,
        summary: `Create a ${singular(resource)}.`,
        requestSchema: writeSchema,
        responseSchema,
        statusCodes: [201, 400],
      },
      {
        method: 'GET',
        path: `${basePath}/:id`,
        summary: `Get a ${singular(resource)} by id.`,
        requestSchema: [],
        responseSchema,
        statusCodes: [200, 404],
      },
      {
        method: 'PUT',
        path: `${basePath}/:id`,
        summary: `Update a ${singular(resource)}.`,
        requestSchema: writeSchema,
        responseSchema,
        statusCodes: [200, 400, 404],
      },
      {
        method: 'DELETE',
        path: `${basePath}/:id`,
        summary: `Delete a ${singular(resource)}.`,
        requestSchema: [],
        responseSchema: [],
        statusCodes: [204, 404],
      },
    ],
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function singular(table: string): string {
  return table.endsWith('s') ? table.slice(0, -1) : table;
}
