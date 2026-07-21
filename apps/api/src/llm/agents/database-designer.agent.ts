import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  type DatabaseDesign,
  type DegradedReason,
  type Entity,
  type EntityColumn,
  type IntentAnalysis,
  type Relation,
  type RequirementDocument,
  type SystemDesign,
  untrustedField,
  applyTenancy,
  requiresMultiTenancy,
  stripUnrequestedSupportTables,
  supportTableDirective,
  tenantEntityFor,
  normalizeDatabaseDesign,
} from '@archivato/shared';
import { BaseAgent, degradedReasonFor } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/**
 * Output budget for a whole schema — **bounded from BOTH sides.**
 *
 * Too small and the schema truncates: the provider default of 2048 cut a
 * seven-entity multi-tenant design off mid-array, and because Groq's native JSON
 * mode validates server-side that arrived as a hard **400 `json_validate_failed`**
 * rather than as short-but-parseable output, so the whole LLM design was thrown
 * away for the template. Relations are emitted *last*, which is exactly why
 * `relations` was the field that went missing.
 *
 * Too large and the request is rejected before the model ever runs: **providers
 * count `max_tokens` against the tokens-per-minute limit**, because it is
 * capacity they must reserve. Groq's free tier gives `openai/gpt-oss-120b` a
 * **TPM of 8,000**, so an 8192 budget on a ~1,300-token prompt asked for 9,496
 * and came back **413 "Request too large"** — a bigger number bought a worse
 * outcome.
 *
 * 5120 threads it: ~6.5K total on a typical prompt, inside an 8K TPM tier with
 * headroom for the prompt to grow, and 2.5x the room the truncation needed.
 * **Raising this is not free** — check the target model's TPM first.
 *
 * This is the budget for the SINGLE-CALL path, which is still how a schema up to
 * `SINGLE_CALL_ENTITY_BUDGET` tables is generated (the common case, unchanged).
 * A larger schema is chunked instead — the escape hatch the original version of
 * this comment reserved ("if schemas outgrow this, chunk by entity group rather
 * than raising it into the TPM wall again"). See `generateChunked`.
 */
const SCHEMA_MAX_TOKENS = 5120;

/**
 * Above this estimated table count, a schema is generated in chunks instead of
 * one call. The estimate is `services + roles` (see `estimateEntityCount`) — a
 * deliberately conservative proxy whose failure direction is safe: over-chunking
 * a medium schema costs one extra small call and is always correct, while
 * under-chunking only risks the truncation the single-call budget already
 * tolerated up to ~12–15 tables, so the floor is well below that.
 */
const SINGLE_CALL_ENTITY_BUDGET = 9;

/**
 * Tables designed per chunk on the large-schema path.
 *
 * The mirror of the API designer's `MAX_ENTITIES_PER_CALL`. A fully-specified
 * table (name, description, ~8 typed columns, its outgoing relations) is lighter
 * than an endpoint group, so 6 fit comfortably inside `SCHEMA_CHUNK_MAX_TOKENS`
 * with room for a reasoning model's headroom — the same "sized to one chunk, not
 * the whole design" rule.
 */
const MAX_ENTITIES_PER_SCHEMA_CALL = 6;

/** Sized to one chunk of tables, not the whole schema. */
const SCHEMA_CHUNK_MAX_TOKENS = 4096;

/**
 * The enumerate call returns table NAMES and one-line purposes only — no
 * columns — so it is tiny and fits any tier. This is the "table of contents"
 * that makes chunking possible: unlike the API designer, whose entity list
 * already exists from the database stage, the schema *invents* its tables, so
 * there is nothing to partition until this call produces the list.
 */
const ENUMERATE_MAX_TOKENS = 1024;

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
    'Any entity that moves through a lifecycle — an order, booking, payment,',
    'request, shipment, ticket — carries an enum "status" column, plus the',
    'timestamps that lifecycle implies. A record that only ever exists (a country,',
    'a category) does not: do not add a status nobody transitions.',
    'A secondary record hangs off the transactional event it belongs to, not just',
    'off the user: an invoice line references its order, a log entry references the',
    'visit that produced it. Carry the user FK as well only when it is genuinely',
    'needed to query by user.',
    'Entities that represent a real-world party (a branch, supplier, clinic)',
    'carry the practical contact fields such a record always needs in production',
    '(phone, email, address) rather than a name alone.',
    'When the system serves several organizations, branches, or tenants, EVERY',
    'table holding their data carries the tenant foreign key — not only the user',
    'table. A tenant column on users alone is not isolation: it leaves every',
    'record queryable across tenants, which is the single most damaging flaw a',
    'multi-tenant schema can ship with.',
    'The converse is equally binding: when the software serves ONE business, do',
    'NOT invent a tenants/organizations table and do NOT put a tenant foreign key',
    'on anything. Tenancy is modelled only when the requirements describe several',
    'organizations, branches, or companies as CUSTOMERS OF THE PLATFORM. Many',
    'products, many customers, or several staff roles are not tenancy. Unrequested',
    'tenancy costs a join on every query and scoping on every endpoint, and it is',
    'billed to a client who never asked for it.',
    'Model the people the business SERVES separately from the people who LOG IN.',
    'Customers/patients/clients are domain records and must not be forced into',
    'the staff account table, and must not carry credentials (password_hash,',
    'role) unless the requirements explicitly describe customer accounts or a',
    'customer login. A guest checkout with no account is the common case, and a',
    'customer row that demands a password contradicts it. When customers do get',
    'accounts, link the customer record to a user row rather than merging them.',
    'Do not put a unique constraint on a contact field that real people share',
    '(a household phone number, a shared family email); uniqueness belongs on',
    'identifiers such as a national ID or an account number.',
    'Model what the requirements ask for and nothing more. Every table is a',
    'migration, a set of endpoints, and build time the client is quoted for, so a',
    'table exists because a functional requirement, a business rule or a stated',
    'constraint needs it — never because a professional product usually has one.',
    'Audit logs, activity feeds, delivery-status logs and soft-delete columns are',
    'features in their own right: include them when they were asked for, and',
    'leave them out when they were not.',
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

    // A large schema does not fit one call, and a cut-off reply doesn't announce
    // itself — Groq's native JSON mode rejects it as a 400 (the whole design is
    // thrown away for the template), and other providers parse it short (the tail
    // tables silently vanish, relations first). So a large one is chunked; the
    // single call below stays the path for everything at or under the budget.
    if (estimateEntityCount(ctx) > SINGLE_CALL_ENTITY_BUDGET) {
      const chunked = await this.generateChunked(sessionId, generatedAt, ctx);
      if (chunked) return chunked;
      this.logger.debug(
        'Schema chunking yielded nothing; trying a single pass before the fallback.',
      );
    }

    return this.generateArtifact<DatabaseDesign>({
      label: 'Database design',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      // `isValid` gates on entities, so a reply that simply omits `relations`
      // gets here — normalize rather than spread it through unchecked.
      accept: (raw) => this.acceptDesign(raw, sessionId, generatedAt, ctx),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
      options: { maxTokens: SCHEMA_MAX_TOKENS },
    });
  }

  /**
   * Normalize an accepted (whole) schema and drop any unrequested tenancy.
   *
   * Shared by the single-call path (where `generateArtifact` adds the provenance
   * stamp) and the chunked path (which stamps itself, like the API designer). It
   * deliberately does NOT stamp `generation`, so the two callers control that.
   */
  private acceptDesign(
    raw: Partial<DatabaseDesign>,
    sessionId: string,
    generatedAt: string,
    ctx: DatabaseDesignContext,
  ): DatabaseDesign {
    return this.withoutUnrequestedTables(
      this.withoutUnrequestedTenancy(
        normalizeDatabaseDesign({
          ...(raw as DatabaseDesign),
          sessionId,
          generatedAt,
        }),
        ctx,
      ),
      ctx,
    );
  }

  /**
   * Drop log-style tables the requirements never asked for.
   *
   * The code half of the same division of labour `withoutUnrequestedTenancy`
   * implements, and it exists for the same reason: the prompt rule that was
   * supposed to gate the audit log had a condition every project satisfied, so it
   * was a default wearing a conditional's clothes. Running here means it applies
   * to the single-call path, the chunked path, and the deterministic build alike
   * — the chunked path especially, where no single call sees the whole schema and
   * a per-chunk instruction could not be checked.
   */
  private withoutUnrequestedTables(
    design: DatabaseDesign,
    ctx: DatabaseDesignContext,
  ): DatabaseDesign {
    const { design: next, removed } = stripUnrequestedSupportTables(
      design,
      ctx.requirements,
    );
    if (removed.length > 0) {
      this.logger.debug(
        `Removed unrequested supporting table(s): ${removed.join(', ')}.`,
      );
    }
    return next;
  }

  /**
   * Generate a large schema in chunks and merge it in code.
   *
   * Two phases, because a schema — unlike the API design, whose entity list
   * already exists upstream — invents its own tables, so there is nothing to
   * partition until we ask for the list:
   *
   *  1. **Enumerate** the full set of table names + one-line purposes (a tiny
   *     response that fits any tier).
   *  2. **Design** each batch of tables in its own call, handing the other
   *     tables' names across as context so foreign keys and relations can point
   *     at them by name.
   *
   * Merge rules mirror the API designer's, and the relation rule is the one that
   * matters: **each chunk emits only the relations that originate FROM its own
   * tables** (`from ∈ batch`), so every relationship is produced exactly once —
   * by the chunk that owns its source table — and none is duplicated or dropped.
   * A chunk that fails or returns junk contributes nothing; its tables simply
   * won't appear, which is no worse than the single-call truncation this
   * replaces. Tenancy and normalization run on the merged whole.
   *
   * Returns `null` (rather than throwing) whenever the chunked build can't be
   * trusted — an empty enumerate, zero surviving tables, or a total outage — so
   * the caller falls back to the single pass and then the deterministic build.
   */
  private async generateChunked(
    sessionId: string,
    generatedAt: string,
    ctx: DatabaseDesignContext,
  ): Promise<DatabaseDesign | null> {
    let names: { name: string; purpose: string }[];
    try {
      names = await this.enumerateEntities(ctx);
    } catch (err) {
      this.logger.warn(
        `Schema enumerate failed (${degradedReasonFor(err)}); falling back to a single pass.`,
      );
      return null;
    }
    if (names.length === 0) return null;

    const chunks = chunk(names, MAX_ENTITIES_PER_SCHEMA_CALL);
    const entities: Entity[] = [];
    const relations: Relation[] = [];
    const seen = new Set<string>();
    let failure: DegradedReason | undefined;

    for (const [index, part] of chunks.entries()) {
      const inBatch = new Set(part.map((p) => p.name));
      const others = names.filter((n) => !inBatch.has(n.name)).map((n) => n.name);
      try {
        const raw = await this.thinkJson<Partial<DatabaseDesign>>(
          this.buildChunkPrompt(ctx, part, others, {
            index: index + 1,
            total: chunks.length,
          }),
          { maxTokens: SCHEMA_CHUNK_MAX_TOKENS },
        );
        if (!this.isValid(raw)) {
          this.logger.debug(`Schema chunk ${index + 1} malformed; skipping.`);
          continue;
        }
        for (const entity of raw.entities as Entity[]) {
          const key = entity.name?.toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          entities.push(entity);
        }
        // A relation belongs to the chunk that owns its source table, so every
        // relationship is emitted once. A relation whose `from` is not in this
        // batch would be speaking for another chunk's table — drop it.
        for (const relation of raw.relations ?? []) {
          if (relation?.from && inBatch.has(relation.from)) relations.push(relation);
        }
      } catch (err) {
        if (chunks.length === 1) throw err;
        failure = degradedReasonFor(err);
        this.logger.warn(`Schema chunk ${index + 1} failed (${failure}): ${err}`);
      }
    }

    if (entities.length === 0) return null;
    return {
      ...this.acceptDesign({ entities, relations }, sessionId, generatedAt, ctx),
      generation: this.provenance('llm', failure),
    };
  }

  /**
   * Phase one of chunking: the list of tables the schema needs, names + purposes
   * only. Untrusted model output, so names are sanitized and de-duplicated; an
   * unusable reply returns `[]`, which routes the caller back to the single pass.
   */
  private async enumerateEntities(
    ctx: DatabaseDesignContext,
  ): Promise<{ name: string; purpose: string }[]> {
    const raw = await this.thinkJson<{
      entities?: { name?: unknown; purpose?: unknown }[];
    }>(this.buildEnumeratePrompt(ctx), { maxTokens: ENUMERATE_MAX_TOKENS });

    const list = Array.isArray(raw?.entities) ? raw.entities : [];
    const seen = new Set<string>();
    const out: { name: string; purpose: string }[] = [];
    for (const item of list) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        purpose: typeof item?.purpose === 'string' ? item.purpose.trim() : '',
      });
    }
    return out;
  }

  /**
   * Reconcile the schema's tenancy with what the requirements/system design
   * actually describe — ADD the tenant table + scoping when required and the
   * model dropped it, STRIP it when present but unrequested.
   *
   * The code backstop exists because the prompt rule cannot be trusted to fire
   * both ways: an emphatic "scope every table" with no stated negative reads as a
   * default (so a single shop got tenancy), while the same rule buried under a
   * thin summary got ignored (so an enterprise HealthTech platform shipped
   * single-tenant). `applyTenancy` makes the deterministic detection, not the
   * model's priors, decide — and runs on both the LLM and fallback paths.
   */
  private withoutUnrequestedTenancy(
    design: DatabaseDesign,
    ctx: DatabaseDesignContext,
  ): DatabaseDesign {
    const { design: next, added, removed } = applyTenancy(
      design,
      ctx.requirements,
      ctx.systemDesign,
    );
    if (removed) this.logger.debug(`Tenancy stripped: ${removed}`);
    if (added) this.logger.warn(`Tenancy added: ${added}`);
    return next;
  }

  /**
   * The tenancy instruction, decided by the deterministic detector rather than
   * left to the model's SaaS priors. This is what stops the schema from guessing
   * multi-tenancy per run: the code reads the requirements + system design and
   * tells the model, unambiguously, which world it is in. `applyTenancy` then
   * enforces the same verdict on the output, so prompt and backstop agree.
   */
  private tenancyDirective(ctx: DatabaseDesignContext): string {
    if (requiresMultiTenancy(ctx.requirements, ctx.systemDesign)) {
      const { table, column } = tenantEntityFor(ctx.requirements, ctx.systemDesign);
      return (
        `MULTI-TENANT (required by the requirements/system design): include a "${table}" tenant ` +
        `table and put a ${column} foreign key on EVERY table that holds tenant data — not only ` +
        `on users. A tenant column on users alone is not isolation; it leaves every record ` +
        `queryable across tenants.`
      );
    }
    return (
      'SINGLE BUSINESS: this product serves ONE organization. Do NOT add a ' +
      'tenants/organizations/branches table and do NOT put any tenant/organization/branch ' +
      'foreign key on any table.'
    );
  }

  /** Services with their responsibilities — the responsibility is where the
   * tenancy/scoping signal lives ("Provisions new tenants…"), so names alone (the
   * old summary) dropped exactly what the schema needed to see. */
  private servicesContext(ctx: DatabaseDesignContext): string {
    return ctx.systemDesign.services
      .map((s) => `- ${s.name}: ${s.responsibility}`)
      .join('\n');
  }

  /** Roles with their descriptions — a role scoped to "a single branch" is a
   * tenancy signal that a bare role name ("Branch Manager") loses. */
  private rolesContext(ctx: DatabaseDesignContext): string {
    return (
      ctx.requirements.roles
        .map((r) => `- ${r.name}: ${r.description ?? ''}`)
        .join('\n') || '- none'
    );
  }

  private buildPrompt(ctx: DatabaseDesignContext): string {
    const entities = ctx.requirements.functional
      .map((f) => `- ${f.title}${f.description ? `: ${f.description}` : ''}`)
      .join('\n');
    return [
      untrustedField('Idea', ctx.idea),
      `Database engine: ${this.databaseType(ctx.systemDesign)}`,
      'Services (each typically owns one or more tables):',
      this.servicesContext(ctx),
      'Roles (may need profile/permission tables):',
      this.rolesContext(ctx),
      'Functional requirements (the data must support these):',
      entities || '- none listed',
      '',
      this.tenancyDirective(ctx),
      '',
      supportTableDirective(ctx.requirements),
      '',
      'Design the schema and return JSON with these keys:',
      '- databaseType: the database engine (echo the one above).',
      '- entities[]: {name (snake_case, plural), description, columns[] {name, type, nullable (boolean), primaryKey? (boolean), unique? (boolean), references? {entity, column}}}.',
      '- relations[]: {from (entity), to (entity), type (one-to-one|one-to-many|many-to-many), description? (what the link means)}.',
      'Give every entity an "id" uuid primary key plus created_at/updated_at, and back every relation with a foreign key column.',
      'Give every entity that moves through a lifecycle an enum "status" column; leave it off entities that never transition.',
      'Link secondary records (lines, logs, attachments, invoices) to the transactional record they belong to, not only to a user.',
      'If the system serves multiple organizations/branches/tenants, put the tenant FK on every table holding their data — not just on users.',
      // This line used to read "Add an audit-log entity whenever the requirements
      // restrict who may read or change records, or name a regulated data
      // category." The intent was conditional; the condition was not. EVERY
      // application with roles restricts who may read or change records, so the
      // rule fired universally and a 40-person internal task board shipped an
      // `audit_logs` table nobody asked for. The verdict is now computed in code
      // by `supportTableDirective` above, which states both branches explicitly.
    ].join('\n');
  }

  /**
   * The enumerate prompt: ask ONLY for the complete table list (names +
   * purposes), no columns. The persona's design rules (separate logins from the
   * people served, junction tables for many-to-many, an audit log for regulated
   * or access-restricted data, tenancy only for multi-org products) come from
   * the shared system prompt, so they shape the list without being restated.
   */
  private buildEnumeratePrompt(ctx: DatabaseDesignContext): string {
    const requirements = ctx.requirements.functional
      .map((f) => `- ${f.title}${f.description ? `: ${f.description}` : ''}`)
      .join('\n');
    return [
      untrustedField('Idea', ctx.idea),
      `Database engine: ${this.databaseType(ctx.systemDesign)}`,
      'Services (each typically owns one or more tables):',
      this.servicesContext(ctx),
      'Roles (may need profile/permission tables):',
      this.rolesContext(ctx),
      'Functional requirements (the data must support these):',
      requirements || '- none listed',
      '',
      this.tenancyDirective(ctx),
      '',
      supportTableDirective(ctx.requirements),
      '',
      'List EVERY table this schema needs — the COMPLETE set, and nothing beyond',
      'it — following the design rules: separate the people who log in from the',
      'people the business serves, and add a join table for each many-to-many link.',
      'If MULTI-TENANT above, the tenant table itself must be in this list.',
      'Return JSON: { entities: [{ name (snake_case, plural), purpose (one short line) }] }.',
      'Table NAMES and purposes only — do NOT design columns yet.',
    ].join('\n');
  }

  /**
   * The per-chunk prompt: fully design THIS batch's tables, with the other
   * tables named as context so foreign keys and relations can reference them.
   */
  private buildChunkPrompt(
    ctx: DatabaseDesignContext,
    batch: { name: string; purpose: string }[],
    others: string[],
    part: { index: number; total: number },
  ): string {
    return [
      untrustedField('Idea', ctx.idea),
      `Database engine: ${this.databaseType(ctx.systemDesign)}`,
      `Roles: ${ctx.requirements.roles.map((r) => r.name).join(', ') || 'none'}`,
      this.tenancyDirective(ctx),
      supportTableDirective(ctx.requirements),
      '',
      `This is part ${part.index} of ${part.total} of ONE schema. Fully design ONLY`,
      'these tables (design each one completely — do not defer any to another part):',
      ...batch.map((b) => `- ${b.name}${b.purpose ? ` — ${b.purpose}` : ''}`),
      '',
      others.length > 0
        ? `Other tables in this schema, handled in other parts — you MAY reference them in foreign keys and relations, but do NOT define their columns: ${others.join(', ')}.`
        : '',
      '',
      'Return JSON with these keys:',
      '- entities[]: {name (snake_case, plural), description, columns[] {name, type, nullable (boolean), primaryKey? (boolean), unique? (boolean), references? {entity, column}}}.',
      '- relations[]: {from (entity), to (entity), type (one-to-one|one-to-many|many-to-many), description? (what the link means)}.',
      '  Include ONLY relations that ORIGINATE FROM the tables you are designing in',
      '  this part (from = one of your tables); reference other tables by their exact',
      '  name. Relations from other parts\' tables are designed there.',
      'Give every table an "id" uuid primary key plus created_at/updated_at, and back every relation with a foreign key column.',
      'Give every table that moves through a lifecycle an enum "status" column; leave it off tables that never transition.',
      'Link secondary records (lines, logs, attachments, invoices) to the transactional record they belong to, not only to a user.',
      'If the system serves multiple organizations/branches/tenants, put the tenant FK on every table holding their data — not just on users.',
    ]
      .filter((line) => line !== '')
      .join('\n');
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

    // Reconcile tenancy on the deterministic build too: a multi-tenant project
    // that falls back offline must still get its tenant table + scoping, and a
    // single-business one must not. The template above never models tenancy, so
    // this is the only place the fallback can gain it.
    return this.withoutUnrequestedTables(
      this.withoutUnrequestedTenancy(
        {
          sessionId,
          generatedAt,
          databaseType: this.databaseType(ctx.systemDesign),
          entities,
          relations,
        },
        ctx,
      ),
      ctx,
    );
  }
}

// ── chunking helpers ──────────────────────────────────────────────────────

/**
 * A conservative upper-ish estimate of how many tables the schema will hold,
 * used only to decide whether to chunk. `services + roles` is a proxy, not a
 * count: services map roughly to primary tables and roles to profile tables,
 * while junction, secondary and audit tables push the true number higher — so
 * this under-counts, which is the safe direction (the single-call budget
 * tolerates a dozen-plus tables, and `SINGLE_CALL_ENTITY_BUDGET` sits well below
 * that). Over-chunking a medium schema only costs one extra small call.
 */
function estimateEntityCount(ctx: DatabaseDesignContext): number {
  const services = ctx.systemDesign.services?.length ?? 0;
  const roles = ctx.requirements.roles?.length ?? 0;
  return services + roles;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
