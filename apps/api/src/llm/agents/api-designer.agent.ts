import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  buildRestApi,
  describeColumns,
  enforceQuerySurface,
  enforceRoleCardinality,
  mergeMissingCoverage,
  reconcileApiFieldTypes,
  normalizeApiModule,
  normalizeExcludedEntities,
  userRoleCardinality,
  validateEntityCoverage,
  withResolvedCoverage,
  type ApiDesign,
  type ApiModule,
  type DatabaseDesign,
  type DegradedReason,
  type Entity,
  type ExcludedEntity,
  type IntentAnalysis,
  type QueryScope,
  type RequirementDocument,
  type SystemDesign,
  untrustedField,
} from '@archivato/shared';
import { BaseAgent, degradedReasonFor } from '../agent.base';
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

  protected readonly systemPrompt = [
    'You are a precise API Designer who turns a data model and service breakdown',
    'into a clean, RESTful HTTP contract a frontend and backend team can build',
    'against without further clarification.',
    'Method: group endpoints by resource/module; use noun-based, pluralized,',
    'lowercase paths (/api/orders, /api/orders/:id) and the correct HTTP verb',
    '(GET read, POST create, PUT/PATCH update, DELETE remove). List endpoints are',
    'paginated, and carry the filters the requirements actually call for — a',
    'lifecycle filter where the resource has states, and free-text search, date',
    'ranges or foreign-key filters where a requirement describes searching,',
    'reporting on, or slicing that specific resource. Do not give every resource a',
    'maximal query surface: a filter nobody asked for is an endpoint contract the',
    'frontend never calls and build time the client still pays for.',
    'Update endpoints can move a resource through',
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
    let degraded: DegradedReason = 'invalid_output';

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
        // `llm` even when a later repair runs: the chunked design is model-authored,
        // and per-module attribution already lives on `ApiModule.source`.
        if (!coverage.missing.length) {
          return this.finalize(
            { ...this.trimQuerySurface(design, ctx), generation: this.provenance('llm') },
            ctx,
          );
        }

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
        return this.finalize(
          { ...this.trimQuerySurface(design, ctx), generation: this.provenance('llm') },
          ctx,
        );
      }
      // No modules at all. If the chunks reported a transport cause, that is the
      // honest reason — "the answer was incomplete" would blame the model for
      // what was actually an outage.
      if (generated.failure) degraded = generated.failure;
      this.logger.debug('API design malformed; using deterministic build.');
    } catch (err) {
      degraded = degradedReasonFor(err);
      this.logger.warn(`API design failed (${degraded}); using fallback: ${err}`);
    }
    return this.finalize(
      {
        ...this.buildDeterministic(sessionId, generatedAt, ctx),
        generation: this.provenance('fallback', degraded),
      },
      ctx,
    );
  }

  /**
   * The one exit every generated design passes through.
   *
   * Both passes reconcile the API contract with the schema it is derived from,
   * and both run on the deterministic path too — where they are near no-ops,
   * which is the point: the builder agrees with the schema today, and if a future
   * edit breaks that, this catches it instead of shipping it.
   */
  private finalize(design: ApiDesign, ctx: ApiDesignContext): ApiDesign {
    return this.reconcileFieldTypes(this.reconcileRoles(design, ctx), ctx);
  }

  /**
   * Make every documented field type agree with the database column it describes.
   *
   * The prompt is the primary defence (the checklist prints real types and the
   * FIELD TYPES rule says to copy them); this is the backstop that makes the
   * guarantee hold whatever the model does — the same split as
   * `enforceScaleAppropriateStack` and `applyTenancy`. It matters here because
   * the failure is invisible: an `integer` id parses, renders, exports to
   * OpenAPI and generates a scaffold perfectly happily, and is only discovered by
   * the team that built against it.
   *
   * The database wins unconditionally. It is what the migration, the Prisma
   * schema, the SQL export and the scaffold are all generated from, so an API doc
   * that disagrees with it is wrong by definition.
   */
  private reconcileFieldTypes(design: ApiDesign, ctx: ApiDesignContext): ApiDesign {
    const { design: next, corrections } = reconcileApiFieldTypes(
      design,
      ctx.databaseDesign,
    );
    if (corrections.length === 0) return next;

    const total = corrections.reduce((sum, c) => sum + c.occurrences, 0);
    this.logger.warn(
      `Corrected ${total} API field type(s) to match the database schema: ` +
        corrections
          .map((c) => `${c.entity}.${c.field} ${c.from}→${c.to} (${c.occurrences})`)
          .join(', '),
    );
    // Surfaced on the artifact, not only in the log: the owner reviews this
    // contract before a team builds against it.
    return { ...next, typeCorrections: corrections };
  }

  /**
   * Narrow a model-authored query surface to what the requirements asked for.
   *
   * The prompt is the primary defence; this is the backstop that makes it hold
   * — the same split as `enforceScaleAppropriateStack` on the tech stack. A
   * design generated before the scale tier existed carries no tier, so
   * `queryScopeFor` returns undefined and this is a no-op.
   */
  private trimQuerySurface(design: ApiDesign, ctx: ApiDesignContext): ApiDesign {
    const scope = queryScopeFor(ctx);
    if (!scope) return design;
    const { design: next, trimmed } = enforceQuerySurface(
      design,
      ctx.databaseDesign,
      scope,
    );
    if (trimmed.length > 0) {
      this.logger.debug(
        `Trimmed ${trimmed.length} unrequested list filter(s) at the ${scope.tier} tier: ${trimmed.join(', ')}.`,
      );
    }
    return next;
  }

  /**
   * Make the user endpoints agree with the database's user↔role cardinality.
   *
   * The database and API stages are generated largely independently, so the
   * schema could model roles many-to-many (a `user_roles` join) while the model,
   * out of habit, gave the create-user body a single `role_id`. This reads the
   * real cardinality from the schema and rewrites `role_id` → `role_ids[]` when
   * it's many-to-many. Deterministic and cheap; a no-op on the offline build,
   * which already reaches roles through the junction's nested routes.
   */
  private reconcileRoles(design: ApiDesign, ctx: ApiDesignContext): ApiDesign {
    const { design: next, changed } = enforceRoleCardinality(
      design,
      ctx.databaseDesign,
    );
    if (changed) {
      this.logger.debug(
        'Rewrote a single role_id to role_ids[] to match the many-to-many role schema.',
      );
    }
    return next;
  }

  /**
   * Tell the model the user↔role cardinality the database actually chose, so the
   * create/update-user contract matches it instead of defaulting to a single
   * `role_id`. The deterministic `reconcileRoles` enforces the same verdict on
   * the output, so prompt and backstop agree.
   */
  private roleCardinalityDirective(ctx: ApiDesignContext): string {
    switch (userRoleCardinality(ctx.databaseDesign)) {
      case 'many':
        return 'USER ROLES: the database models users↔roles as MANY-TO-MANY. The create/update-user request and the user response MUST use role_ids (a JSON array of ids), never a single role_id.';
      case 'single':
        return 'USER ROLES: the database gives each user ONE role — use a single role_id, not an array.';
      default:
        return '';
    }
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
  ): Promise<{
    modules: ApiModule[];
    excludedEntities: ExcludedEntity[];
    /** Why the last chunk failed, when one did — see the catch below. */
    failure?: DegradedReason;
  }> {
    const chunks = chunk(entities, MAX_ENTITIES_PER_CALL);
    const modules: ApiModule[] = [];
    const excludedEntities: ExcludedEntity[] = [];
    const usedNames = new Set<string>();
    let failure: DegradedReason | undefined;

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
        // Remember WHY, not just that it failed. A multi-chunk run swallows its
        // own errors so a partial outage still yields a design — which means a
        // TOTAL outage reaches the caller as an empty module list with no
        // exception, and the artifact would be stamped "the AI answer was
        // incomplete" for what was actually a network failure.
        failure = degradedReasonFor(err);
        this.logger.warn(`API design chunk ${index + 1} failed (${failure}): ${err}`);
      }
    }

    return { modules, excludedEntities, failure };
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
      untrustedField('Idea', ctx.idea),
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
      '  Each endpoint: {method (GET|POST|PUT|PATCH|DELETE), path, summary (what it does), requestSchema[] {name, type, required (boolean)}, responseSchema[] {name, type, required (boolean)}, statusCodes[] (a JSON array of DISTINCT integers, e.g. [200,400,404] — never one run-together number like 200400404, never a string)}.',
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
      this.roleCardinalityDirective(ctx),
      // The gate used to be "where the entity's columns support it", which is a
      // purely structural test every entity passes — so a lightweight task board
      // got free-text search, a date range and five FK filters on comments,
      // notifications and audit logs alike. The gate is now what the requirements
      // ask for; the structural test remains as the ceiling, not the trigger.
      'LIST ENDPOINTS — a GET collection\'s requestSchema is its query string. Always include page/limit. Then add, ONLY where BOTH the columns support it AND a requirement calls for it:',
      '- the lifecycle column itself (status/state), whenever the entity has one — a resource with states exists to be filtered by them.',
      '- search: free-text over the entity\'s own text columns, when a requirement describes searching, finding or browsing THIS resource.',
      '- a date range as <date_column_without_at>_from / _to (e.g. created_from, created_to), when a requirement describes reporting, history, or filtering this resource by time.',
      '- a filter per foreign-key column a requirement describes scoping this resource by (e.g. customer_id). Do not add one per FK by reflex.',
      `- ${scaleGuidance(ctx)}`,
      'Use the data model\'s own column names, all optional (required: false). Never expose a password, hash, token, or secret column as a filter.',
      'Updates must be able to change the lifecycle state too, not only descriptive fields.',
      'Omit server-managed fields (id, created_at, updated_at, password_hash) from request BODIES (POST/PUT/PATCH).',
      // The checklist above now prints every column's real type. Without this
      // rule saying to copy it, a model still reaches for the REST convention it
      // has seen most — which is how a fully uuid schema was documented with
      // integer ids in all 48 endpoints.
      'FIELD TYPES — COPY THEM, DO NOT INVENT THEM. Every "type" you emit must be the EXACT type printed next to that column in the checklist above (uuid, string, integer, decimal, boolean, timestamp, date, enum, json). This is not a style preference: the schema above is what the migration and the client SDK are generated from, so a type that disagrees with it is wrong even when it looks more conventional.',
      '- Identifiers are whatever the schema says they are. If a primary key is uuid, then that resource\'s id, every *_id referencing it, and the :id path parameter are ALL uuid — never integer, and never an auto-incrementing number.',
      '- The same holds for every other type: a timestamp column is timestamp (not string), a decimal is decimal (not number), an enum is enum (not string), a json column is json.',
      '- A field that is NOT a column — page, limit, search, accessToken — keeps its natural type; this rule is about fields the data model already defines.',
    );

    return lines.join('\n');
  }

  private buildRepairPrompt(
    ctx: ApiDesignContext,
    design: ApiDesign,
    missing: Entity[],
  ): string {
    return [
      untrustedField('Idea', ctx.idea),
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
      queryScope: queryScopeFor(ctx),
    });
    const design: ApiDesign = { sessionId, generatedAt, modules };
    if (excludedEntities.length > 0) design.excludedEntities = excludedEntities;
    return design;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * What the requirements ask a list endpoint to do, scoped by the tier the System
 * Architect already decided.
 *
 * The tier is READ from the system design rather than recomputed here, so the
 * API surface and the infrastructure are sized by one assessment of one set of
 * numbers. A design generated before the tier existed carries none, and an
 * absent tier means the previous behaviour — the structural maximum — exactly
 * like an absent `sourceStamp` never reads as stale.
 */
function queryScopeFor(ctx: ApiDesignContext): QueryScope | undefined {
  const tier = ctx.systemDesign.scaleTier;
  if (!tier) return undefined;
  return { tier, requirementText: requirementText(ctx) };
}

function requirementText(ctx: ApiDesignContext): string {
  const r = ctx.requirements;
  return [
    ...(r.functional ?? []).map((f) => `${f.title} ${f.description}`),
    ...(r.nonFunctional ?? []).map((n) => n.description),
    ...(r.businessRules ?? []).map((b) => b.description),
  ].join(' ');
}

/** The tier's one-line instruction for the prompt's list-endpoint section. */
function scaleGuidance(ctx: ApiDesignContext): string {
  switch (ctx.systemDesign.scaleTier) {
    case 'small':
      return 'This is a SMALL/MVP-scale system: keep the query surface minimal. Most resources need only page/limit (plus a status filter where they have states). Add search or a date range only where a requirement above plainly asks for it on that resource.';
    case 'large':
      return 'This is a LARGE-scale system: a rich query surface on the high-traffic resources is justified, but still tie each filter to a requirement rather than adding one per column.';
    default:
      return 'Add filters where a requirement calls for them; a resource nobody searches needs no search parameter.';
  }
}

/**
 * Name, purpose, columns and relationships — the checklist line for one entity.
 *
 * The columns carry their **types** and their PK/FK markers. They used to be
 * bare names (and silently capped at 10), which is why a design whose primary
 * keys are all `uuid` came back documenting every id as `integer`: the prompt
 * told the model "field names match the data model" and showed it no types to
 * match, so it filled the gap with the REST convention its training data is full
 * of. A model cannot copy what it was never shown.
 */
function describeEntity(entity: Entity, db: DatabaseDesign): string {
  const parts = [entity.name];
  if (entity.description?.trim()) parts.push(`— ${entity.description.trim()}`);

  const columns = describeColumns(entity);
  if (columns) parts.push(`| columns: ${columns}`);

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
