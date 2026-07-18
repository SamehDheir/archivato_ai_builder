import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  buildRestApi,
  mergeMissingCoverage,
  normalizeApiModule,
  normalizeExcludedEntities,
  validateEntityCoverage,
  withResolvedCoverage,
  type ApiDesign,
  type ApiModule,
  type DatabaseDesign,
  type Entity,
  type ExcludedEntity,
  type IntentAnalysis,
  type RequirementDocument,
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

/**
 * Entities designed per model call.
 *
 * The API design is by far the largest artifact this pipeline produces — five
 * endpoints per entity, each carrying two schemas and its status codes — and the
 * default output ceiling is 2048 tokens on Groq (the default real provider) and
 * Azure, 4096 on Claude. A ten-entity system does not fit, and a response cut
 * off mid-array doesn't announce itself: it either fails to parse (and we throw
 * the whole LLM design away for the offline fallback) or it parses short and the
 * tail entities silently have no API.
 *
 * So a big design is generated in chunks and merged by code, rather than betting
 * a bigger `maxTokens` will hold. Four entities ≈ 20 endpoints, which fits the
 * explicit `CHUNK_MAX_TOKENS` below.
 *
 * The margin narrowed when list endpoints gained real query parameters (search /
 * lifecycle / date range / FK filters) — roughly +5 schema fields per entity. It
 * still fits, and a chunk that doesn't costs precision rather than coverage: it
 * contributes nothing, and its entities fall through repair to the deterministic
 * builder. Lower this before raising `CHUNK_MAX_TOKENS` if that starts happening.
 */
export const MAX_ENTITIES_PER_CALL = 4;

/** Sized to one chunk, not to the whole design. */
const CHUNK_MAX_TOKENS = 4096;

/**
 * Owns the API Design stage: REST endpoints grouped by module, each with method,
 * request/response schemas, and status codes. LLM-driven with a deterministic
 * fallback that derives CRUD endpoints from the database entities.
 *
 * The stage's contract is **entity coverage**: every entity in the database
 * design gets an endpoint group or a declared reason it doesn't. The model is
 * asked for it, the code checks it, and a gap costs one small repair call rather
 * than a table that quietly ends up with no API.
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
    '(GET read, POST create, PUT/PATCH update, DELETE remove). List endpoints are',
    'queryable, not merely paginated: alongside page/limit they expose free-text',
    'search, a filter for the resource\'s lifecycle state, a date range, and a',
    'filter per relevant foreign key. Update endpoints can move a resource through',
    'its lifecycle, not just edit its attributes. Request schemas exclude',
    '(id, timestamps, password_hash); response schemas reflect what is actually',
    'returned. Every endpoint declares realistic status codes including its error',
    'cases (400 validation, 401/403 auth, 404 not found, 409 conflict).',
    'You account for EVERY entity in the data model: each one is either reachable',
    'through an endpoint group or explicitly declared as excluded with a reason.',
    'Output standard: paths, methods, and schemas are internally consistent with',
    'the entities and services, field names match the data model, and there are no',
    'placeholder or duplicated endpoints. Return ONLY strict JSON matching the',
    'schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(sessionId: string, ctx: ApiDesignContext): Promise<ApiDesign> {
    const generatedAt = new Date().toISOString();
    const entities = ctx.databaseDesign.entities ?? [];
    const names = entities.map((e) => e.name);

    try {
      const generated = await this.generateModules(ctx, entities);
      if (generated.modules.length > 0) {
        let design = withResolvedCoverage(
          {
            sessionId,
            generatedAt,
            modules: generated.modules,
            excludedEntities: generated.excludedEntities,
          },
          names,
        );

        const coverage = validateEntityCoverage(design, names);
        if (!coverage.missing.length) return design;

        // One repair round-trip, scoped to the gap. It doubles as the truncation
        // escape hatch: the second call carries a handful of entities, so it fits
        // where a whole-design retry would be cut off at exactly the same place.
        this.logger.debug(
          `API design missed ${coverage.missing.length} entities; repairing: ${coverage.missing.join(', ')}`,
        );
        design = await this.repair(design, ctx, coverage.missing);
        design = withResolvedCoverage(design, names);

        // Whatever is still uncovered is the service's to fill deterministically
        // before it persists anything — never the user's to discover.
        return design;
      }
      this.logger.debug('API design malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`API design failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  /**
   * Ask the model for the endpoint groups, in one call or several.
   *
   * A chunk that fails or returns junk contributes nothing and is simply left
   * out — its entities then read as uncovered, which routes them through the
   * same repair-then-fallback path as any other gap. A partial outage costs
   * precision, never coverage.
   */
  private async generateModules(
    ctx: ApiDesignContext,
    entities: Entity[],
  ): Promise<{ modules: ApiModule[]; excludedEntities: ExcludedEntity[] }> {
    const chunks = chunk(entities, MAX_ENTITIES_PER_CALL);
    const modules: ApiModule[] = [];
    const excludedEntities: ExcludedEntity[] = [];
    const usedNames = new Set<string>();

    for (const [index, part] of chunks.entries()) {
      const others = entities
        .filter((e) => !part.includes(e))
        .map((e) => e.name);
      try {
        const raw = await this.thinkJson<Partial<ApiDesign>>(
          this.buildPrompt(ctx, part, {
            includeAuth: index === 0,
            others,
            chunk: chunks.length > 1 ? { index: index + 1, total: chunks.length } : null,
          }),
          { maxTokens: CHUNK_MAX_TOKENS },
        );
        if (!this.isValid(raw)) {
          this.logger.debug(`API design chunk ${index + 1} malformed; skipping.`);
          continue;
        }
        for (const module of raw.modules as ApiModule[]) {
          const normalized = normalizeApiModule(module);
          // Chunks can't see each other, so two of them can name a module the
          // same thing; the view keys its list on that name.
          if (usedNames.has(normalized.name)) {
            let name = normalized.name;
            let n = 2;
            while (usedNames.has(name)) name = `${normalized.name} ${n++}`;
            normalized.name = name;
          }
          usedNames.add(normalized.name);
          modules.push({ ...normalized, source: 'llm' });
        }
        // A chunk may only speak for its own entities. Left unscoped, a chunk
        // that excused an entity belonging to a *later* chunk would satisfy the
        // validator on its behalf — and if that chunk then failed, the entity
        // would end up with no API and a reason nobody designed, which is the
        // exact failure this stage exists to prevent.
        const inChunk = new Set(part.map((e) => e.name));
        excludedEntities.push(
          ...(normalizeExcludedEntities(raw.excludedEntities) ?? []).filter((e) =>
            inChunk.has(e.entity),
          ),
        );
      } catch (err) {
        if (chunks.length === 1) throw err;
        this.logger.warn(`API design chunk ${index + 1} failed: ${err}`);
      }
    }

    return { modules, excludedEntities };
  }

  /**
   * One follow-up call for the entities nothing covers, with the existing design
   * as context so the model extends it rather than re-imagining it. Metered like
   * any other call — it goes through `thinkJson`.
   */
  private async repair(
    design: ApiDesign,
    ctx: ApiDesignContext,
    missing: string[],
  ): Promise<ApiDesign> {
    const entities = (ctx.databaseDesign.entities ?? []).filter((e) =>
      missing.includes(e.name),
    );
    try {
      const raw = await this.thinkJson<Partial<ApiDesign>>(
        this.buildRepairPrompt(ctx, design, entities),
        { maxTokens: CHUNK_MAX_TOKENS },
      );
      if (!this.isValid(raw)) {
        this.logger.debug('API design repair malformed; leaving the gap to the fallback.');
        return design;
      }
      return mergeMissingCoverage(
        design,
        {
          modules: (raw.modules as ApiModule[]).map((m) => ({
            ...normalizeApiModule(m),
            source: 'llm-repair' as const,
          })),
          excludedEntities: normalizeExcludedEntities(raw.excludedEntities),
        },
        missing,
      );
    } catch (err) {
      this.logger.warn(`API design repair failed: ${err}`);
      return design;
    }
  }

  private buildPrompt(
    ctx: ApiDesignContext,
    entities: Entity[],
    opts: {
      includeAuth: boolean;
      others: string[];
      chunk: { index: number; total: number } | null;
    },
  ): string {
    const lines = [
      `Idea: ${ctx.idea}`,
      `Services: ${ctx.systemDesign.services.map((s) => s.name).join(', ')}`,
      '',
    ];

    if (opts.chunk) {
      lines.push(
        `This is part ${opts.chunk.index} of ${opts.chunk.total} of one API design.`,
        'Design endpoint groups for THIS PART\'S entities only — the other parts',
        'cover the rest, and duplicating them would produce conflicting resources.',
        '',
      );
    }

    lines.push(
      `COVERAGE CHECKLIST — the ${entities.length} entities you must account for:`,
      ...entities.map((e, i) => `${i + 1}. ${describeEntity(e, ctx.databaseDesign)}`),
      '',
    );

    if (opts.others.length > 0) {
      lines.push(
        `Context only — entities handled elsewhere, do NOT design for them: ${opts.others.join(', ')}.`,
        '',
      );
    }

    lines.push(
      'Return JSON with these keys:',
      '- modules[]: {name, basePath (e.g. /api/orders), coveredEntities[] (exact entity names from the checklist this group gives access to), endpoints[]}.',
      '  Each endpoint: {method (GET|POST|PUT|PATCH|DELETE), path, summary (what it does), requestSchema[] {name, type, required (boolean)}, responseSchema[] {name, type, required (boolean)}, statusCodes[] (integers incl. error cases)}.',
      '- excludedEntities[]: {entity (exact name), reason} — only for checklist entities you deliberately give no endpoint group.',
      '',
      'COVERAGE RULES (the design is invalid if broken):',
      '- Every checklist entity appears in some group\'s coveredEntities OR in excludedEntities. Zero coverage with no declared exclusion is invalid.',
      '- Not every entity needs full CRUD. Read-only, or reachable only through a parent\'s nested routes, is fine — list it in coveredEntities either way.',
      '- Exclusion reasons are narrow. Only these qualify:',
      '  (a) a pure junction/join table managed entirely through its parents;',
      '  (b) an internal/system table (migrations, sessions) with no client use;',
      '  (c) an entity served only via a parent resource\'s nested routes — the reason MUST name that parent resource.',
      '  "Not needed", "out of scope", or "low priority" are NOT valid reasons.',
      '- One group per resource: never two groups for the same entity.',
      '',
      opts.includeAuth
        ? 'Include an Auth module (register/login/refresh) alongside the resource groups; it covers no checklist entity, so give it coveredEntities: [].\nA public registration endpoint must NOT accept role, permission, or tenant/organization ids in its request body — a caller who can name their own role can register as an administrator. Those are assigned by an authenticated admin endpoint.'
        : 'Do not include an Auth module — another part of this design already has it.',
      'LIST ENDPOINTS — a GET collection\'s requestSchema is its query string. Beyond page/limit, include (where the entity\'s columns support it):',
      '- search: free-text over the entity\'s own text columns, when it has any.',
      '- the lifecycle column itself (status/state), when the entity has one.',
      '- a date range as <date_column_without_at>_from / _to (e.g. created_from, created_to).',
      '- one filter per relevant foreign-key column, named exactly as the column (e.g. customer_id).',
      'Use the data model\'s own column names, all optional (required: false). Never expose a password, hash, token, or secret column as a filter.',
      'Updates must be able to change the lifecycle state too, not only descriptive fields.',
      'Omit server-managed fields (id, created_at, updated_at, password_hash) from request BODIES (POST/PUT/PATCH).',
    );

    return lines.join('\n');
  }

  private buildRepairPrompt(
    ctx: ApiDesignContext,
    design: ApiDesign,
    missing: Entity[],
  ): string {
    return [
      `Idea: ${ctx.idea}`,
      '',
      'An API design already exists with these endpoint groups:',
      ...design.modules.map(
        (m) =>
          `- ${m.name} (${m.basePath}) — covers: ${(m.coveredEntities ?? []).join(', ') || 'nothing'}`,
      ),
      '',
      `These ${missing.length} entities have NO coverage in it, which is invalid:`,
      ...missing.map((e, i) => `${i + 1}. ${describeEntity(e, ctx.databaseDesign)}`),
      '',
      'Return JSON with these keys, for EXACTLY these entities and nothing else:',
      '- modules[]: {name, basePath, coveredEntities[] (exact entity names), endpoints[] {method, path, summary, requestSchema[] {name, type, required}, responseSchema[] {name, type, required}, statusCodes[]}}.',
      '- excludedEntities[]: {entity, reason} — only where an entity legitimately needs no group of its own: a pure junction table managed through its parents, an internal/system table, or an entity served only through a parent resource\'s nested routes (name that parent).',
      '',
      'Do NOT redesign, rename, or repeat the existing groups above — they are already correct, and a second group for the same resource would conflict.',
      'Reuse the existing groups\' conventions (path style, pagination, status codes) so the result reads as one design.',
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

  /**
   * The whole design, from the entities alone. Groups are left untagged on
   * purpose: this is the expected output with no LLM configured, not a patch over
   * a model's gap, and marking every group "generated-fallback" would drown the
   * warning that means something.
   */
  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: ApiDesignContext,
  ): ApiDesign {
    const { modules, excludedEntities } = buildRestApi(ctx.databaseDesign, {
      includeAuth: true,
    });
    const design: ApiDesign = { sessionId, generatedAt, modules };
    if (excludedEntities.length > 0) design.excludedEntities = excludedEntities;
    return design;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Name, purpose, columns and relationships — the checklist line for one entity. */
function describeEntity(entity: Entity, db: DatabaseDesign): string {
  const parts = [entity.name];
  if (entity.description?.trim()) parts.push(`— ${entity.description.trim()}`);

  const columns = (entity.columns ?? []).slice(0, 10).map((c) => c.name);
  if (columns.length > 0) parts.push(`| columns: ${columns.join(', ')}`);

  const relations = (db.relations ?? [])
    .filter((r) => r.from === entity.name || r.to === entity.name)
    .slice(0, 5)
    .map((r) => `${r.from} ${r.type} ${r.to}`);
  if (relations.length > 0) parts.push(`| relations: ${relations.join('; ')}`);

  return parts.join(' ');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
