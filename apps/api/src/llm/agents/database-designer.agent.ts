import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  type DatabaseDesign,
  type Entity,
  type EntityColumn,
  type IntentAnalysis,
  type Relation,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** What the Database Designer needs from upstream stages. */
export interface DatabaseDesignContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
}

/**
 * Owns the Database Design stage: entities, primary keys, foreign keys, and
 * relations. LLM-driven with a deterministic fallback derived from the system
 * design's services and the requirement document's roles.
 */
@Injectable()
export class DatabaseDesignerAgent extends BaseAgent {
  readonly role = AgentRole.DatabaseDesigner;

  private readonly logger = new Logger(DatabaseDesignerAgent.name);

  protected readonly systemPrompt = [
    'You are a careful Database Designer who turns a system design into a clean,',
    'normalized relational schema an engineer could migrate as-is.',
    'Method: model one entity per real-world concept, normalized to 3NF (no',
    'duplicated data, no multi-value columns); resolve many-to-many relationships',
    'with an explicit join entity. Every table has a uuid "id" primary key and',
    'created_at / updated_at timestamps. Foreign keys are named <entity>_id and',
    'reference the owning table. Choose precise column types (uuid, string, text,',
    'integer, decimal, boolean, timestamp, enum, json) and mark nullability,',
    'uniqueness, and PK/FK explicitly. Store secrets hashed (password_hash), never',
    'plaintext.',
    'Output standard: names are snake_case and consistent (plural tables, singular',
    'columns), every relationship is one-to-one / one-to-many / many-to-many and',
    'is backed by a real FK, and the schema fully covers the services and roles',
    'with no orphan tables. Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: DatabaseDesignContext,
  ): Promise<DatabaseDesign> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<DatabaseDesign>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return { ...(raw as DatabaseDesign), sessionId, generatedAt };
      }
      this.logger.debug('Database design malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Database design failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: DatabaseDesignContext): string {
    const services = ctx.systemDesign.services.map((s) => s.name).join(', ');
    const roles = ctx.requirements.roles.map((r) => r.name).join(', ');
    const entities = ctx.requirements.functional
      .slice(0, 10)
      .map((f) => `- ${f.title}`)
      .join('\n');
    return [
      `Idea: ${ctx.idea}`,
      `Database engine: ${this.databaseType(ctx.systemDesign)}`,
      `Services (each typically owns one or more tables): ${services}`,
      `Roles (may need profile/permission tables): ${roles || 'none'}`,
      'Functional requirements (the data must support these):',
      entities || '- none listed',
      '',
      'Design the schema and return JSON with these keys:',
      '- databaseType: the database engine (echo the one above).',
      '- entities[]: {name (snake_case, plural), description, columns[] {name, type, nullable (boolean), primaryKey? (boolean), unique? (boolean), references? {entity, column}}}.',
      '- relations[]: {from (entity), to (entity), type (one-to-one|one-to-many|many-to-many), description? (what the link means)}.',
      'Give every entity an "id" uuid primary key plus created_at/updated_at, and back every relation with a foreign key column.',
    ].join('\n');
  }

  private isValid(value: Partial<DatabaseDesign> | null): boolean {
    return (
      !!value &&
      Array.isArray(value.entities) &&
      value.entities.length > 0 &&
      value.entities.every((e) => Array.isArray(e.columns))
    );
  }

  private databaseType(design: SystemDesign): string {
    const db = design.techStack.find((t) => t.layer === 'database');
    return db?.technology ?? 'PostgreSQL';
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: DatabaseDesignContext,
  ): DatabaseDesign {
    const entities: Entity[] = [usersEntity()];
    const relations: Relation[] = [];

    // One profile table per non-generic role (e.g. doctors, patients).
    for (const role of ctx.requirements.roles) {
      const table = roleTableName(role.name);
      if (!table || table === 'users' || entities.some((e) => e.name === table)) {
        continue;
      }
      entities.push(profileEntity(table, role.description));
      relations.push({
        from: 'users',
        to: table,
        type: 'one-to-one',
        description: `A user may have a ${singular(table)} profile.`,
      });
    }

    // Service-driven tables.
    const serviceNames = ctx.systemDesign.services.map((s) => s.name);
    if (serviceNames.includes('Billing')) {
      entities.push(invoicesEntity());
      relations.push(ownedByUser('invoices'));
    }
    if (serviceNames.includes('Notifications')) {
      entities.push(notificationsEntity());
      relations.push(ownedByUser('notifications'));
    }
    if (serviceNames.includes('Reporting')) {
      entities.push(reportsEntity());
      relations.push(ownedByUser('reports'));
    }

    return {
      sessionId,
      generatedAt,
      databaseType: this.databaseType(ctx.systemDesign),
      entities,
      relations,
    };
  }
}

// ── deterministic helpers ─────────────────────────────────────────────────

const timestamps = (): EntityColumn[] => [
  { name: 'created_at', type: 'timestamp', nullable: false },
  { name: 'updated_at', type: 'timestamp', nullable: false },
];

const pk = (): EntityColumn => ({
  name: 'id',
  type: 'uuid',
  nullable: false,
  primaryKey: true,
});

const userFk = (): EntityColumn => ({
  name: 'user_id',
  type: 'uuid',
  nullable: false,
  references: { entity: 'users', column: 'id' },
});

function usersEntity(): Entity {
  return {
    name: 'users',
    description: 'Application user accounts and credentials.',
    columns: [
      pk(),
      { name: 'email', type: 'string', nullable: false, unique: true },
      { name: 'password_hash', type: 'string', nullable: false },
      { name: 'role', type: 'string', nullable: false },
      ...timestamps(),
    ],
  };
}

function profileEntity(table: string, description: string): Entity {
  return {
    name: table,
    description: description || `${table} profile linked to a user.`,
    columns: [
      pk(),
      userFk(),
      { name: 'full_name', type: 'string', nullable: false },
      ...timestamps(),
    ],
  };
}

function invoicesEntity(): Entity {
  return {
    name: 'invoices',
    description: 'Billing invoices issued to users.',
    columns: [
      pk(),
      userFk(),
      { name: 'amount', type: 'decimal', nullable: false },
      { name: 'currency', type: 'string', nullable: false },
      { name: 'status', type: 'enum', nullable: false },
      { name: 'issued_at', type: 'timestamp', nullable: false },
      ...timestamps(),
    ],
  };
}

function notificationsEntity(): Entity {
  return {
    name: 'notifications',
    description: 'Outbound notifications to users.',
    columns: [
      pk(),
      userFk(),
      { name: 'channel', type: 'enum', nullable: false },
      { name: 'message', type: 'text', nullable: false },
      { name: 'status', type: 'enum', nullable: false },
      { name: 'sent_at', type: 'timestamp', nullable: true },
      ...timestamps(),
    ],
  };
}

function reportsEntity(): Entity {
  return {
    name: 'reports',
    description: 'Generated reports and analytics snapshots.',
    columns: [
      pk(),
      userFk(),
      { name: 'type', type: 'string', nullable: false },
      { name: 'payload', type: 'json', nullable: false },
      ...timestamps(),
    ],
  };
}

function ownedByUser(table: string): Relation {
  return {
    from: 'users',
    to: table,
    type: 'one-to-many',
    description: `A user has many ${table}.`,
  };
}

function roleTableName(role: string): string {
  const clean = role.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (!clean || /^(admin|administrator|user|users)$/.test(clean)) return '';
  return clean.endsWith('s') ? clean : `${clean}s`;
}

function singular(table: string): string {
  return table.endsWith('s') ? table.slice(0, -1) : table;
}
