/**
 * The deterministic REST builder — a complete HTTP contract derived from the
 * database design with no LLM involved.
 *
 * It has two callers, and that is deliberate: it is the API Designer's offline
 * fallback (whole design), and it is the last-resort filler for the handful of
 * entities an LLM left uncovered even after a repair round-trip (`only`). One
 * builder for both, so a patched-in group is shaped exactly like a generated one.
 *
 * Pure and runtime-free.
 */

import type {
  ApiEndpoint,
  ApiDesign,
  ApiModule,
  ApiModuleSource,
  ExcludedEntity,
  SchemaField,
} from './api-design';
import type { DatabaseDesign, Entity, EntityColumn } from './database-design';
import {
  mergeMissingCoverage,
  validateEntityCoverage,
  withResolvedCoverage,
} from './api-design.coverage';
import type { ScaleTier } from './scale-tier';
import { singularNoun } from './text';

/** Columns the server owns — never accepted in a request body. */
const SERVER_MANAGED = new Set(['id', 'created_at', 'updated_at', 'password_hash']);

export interface BuildRestApiOptions {
  /** Build for these entity names only (the repair path). Default: every entity. */
  only?: readonly string[];
  /** Stamped on every group produced. */
  source?: ApiModuleSource;
  /** Include the Auth module. Default: false. */
  includeAuth?: boolean;
  /**
   * What the requirements actually ask a list endpoint to do. Absent ⇒ the
   * structural maximum, which is what this builder always produced.
   */
  queryScope?: QueryScope;
}

/** The inputs `queryDemandFor` weighs, threaded down from the API designer. */
export interface QueryScope {
  tier: ScaleTier;
  /** Functional + non-functional requirement prose, concatenated. */
  requirementText: string;
}

/** Endpoint groups plus the exclusions that account for the rest. */
export interface RestApiBuild {
  modules: ApiModule[];
  excludedEntities: ExcludedEntity[];
}

/** Foreign-key columns, in declaration order. */
function foreignKeys(entity: Entity): EntityColumn[] {
  return (entity.columns ?? []).filter((c) => !!c.references?.entity);
}

/** Column types a free-text `search` can reasonably match against. */
const TEXTUAL = new Set(['string', 'text', 'varchar', 'char']);

/** A column holding a lifecycle state, whatever the designer called it. */
const STATUS_COLUMN = /^(status|state)$|_(status|state)$/i;

/** Never expose these as a filter, even when the type would allow it. */
const SENSITIVE = /password|secret|token|hash|salt/i;

/**
 * How many foreign-key filters one list endpoint may carry, per tier.
 *
 * Beyond a handful this stops being a useful contract and starts being noise the
 * frontend never calls — and on a small internal tool, "a handful" is smaller.
 * Five was the flat ceiling before scale was a consideration; it remains the
 * ceiling for a large system, where a list genuinely gets sliced many ways.
 */
const MAX_FK_FILTERS: Record<ScaleTier, number> = { small: 2, medium: 3, large: 5 };

/** The default when no scope is supplied: the structural maximum, as before. */
const DEFAULT_FK_FILTERS = MAX_FK_FILTERS.large;

/** Which optional query capabilities a list endpoint should expose. */
export interface ListQueryDemand {
  search: boolean;
  /** Filter on the lifecycle column, when the entity has one. */
  status: boolean;
  dateRange: boolean;
  maxFkFilters: number;
}

/**
 * Everything the columns structurally support — the behaviour before scale was
 * weighed, and the fallback whenever no scope is known.
 */
export const FULL_QUERY_DEMAND: ListQueryDemand = {
  search: true,
  status: true,
  dateRange: true,
  maxFkFilters: DEFAULT_FK_FILTERS,
};

/** Verbs that make a sentence a request to search or filter something. */
const SEARCH_DEMAND =
  /\b(?:search|filter|find|look ?up|browse|query|sort|narrow|autocomplete|type[- ]?ahead)\b|(?:بحث|يبحث|تصفية|فلترة|فرز|تصفح)/i;

/** Language that makes a sentence a request to slice something by time. */
const DATE_DEMAND =
  /\b(?:date range|between .{0,20}dates?|by date|over time|per (?:day|week|month)|monthly|weekly|daily|history|historical|trend|report|analytics|dashboard|archive|overdue|due date|upcoming)\b|(?:نطاق زمني|حسب التاريخ|شهري|أسبوعي|يومي|تقرير|سجل تاريخي|متأخر)/i;

/**
 * Sentences that talk about this entity, by name.
 *
 * Crude on purpose — a stem match on the table's own noun. A precise
 * entity-to-requirement mapping is a much harder problem and getting it slightly
 * wrong here costs at most one query parameter, which is the cheap direction.
 */
function sentencesAbout(entity: Entity, requirementText: string): string {
  // `singular()` strips a bare trailing "s", which is right for the path segments
  // it was written for and wrong here: it turns `addresses` into `addresse` and
  // `statuses` into `statuse`, tokens that appear in no sentence — so demand
  // detection silently failed closed for every -es plural, reporting "nobody
  // asked to search this" about an entity a requirement plainly named.
  const noun = singularNoun(entity.name).replace(/_/g, ' ').toLowerCase();
  if (noun.length < 3) return '';
  return requirementText
    .split(/(?<=[.!?؟\n])\s+/)
    .filter((s) => s.toLowerCase().includes(noun))
    .join(' ');
}

/**
 * What the requirements actually ask a list endpoint for THIS entity to do.
 *
 * The bug this fixes: both the prompt and this builder produced free-text
 * search, a lifecycle filter, a date range and up to five foreign-key filters on
 * **every** entity, gated only on whether the columns allowed it. On a
 * lightweight internal task board that meant multi-field filtering on comments,
 * notifications and audit logs — endpoints nobody would ever call, each of which
 * is real build and test time in the effort estimate.
 *
 * The gate is applied at the **small tier only**, and that restraint is
 * deliberate. On a medium or large system the entity count is higher and the
 * requirement prose is richer, so structural inference is much closer to right,
 * and stripping a filter a big system genuinely needs is a defect the client
 * feels. On a small one, the requirements are short enough that their silence
 * about searching `comments` really does mean nobody asked to search comments.
 *
 * `page`/`limit` are never gated: a list endpoint without them is worse at every
 * scale, and they cost one line each. The lifecycle filter likewise survives on
 * structure alone — an entity with a `status` column exists to be filtered by it.
 */
export function queryDemandFor(entity: Entity, scope: QueryScope): ListQueryDemand {
  const maxFkFilters = MAX_FK_FILTERS[scope.tier] ?? DEFAULT_FK_FILTERS;
  if (scope.tier !== 'small') return { ...FULL_QUERY_DEMAND, maxFkFilters };

  const relevant = sentencesAbout(entity, scope.requirementText);
  return {
    search: SEARCH_DEMAND.test(relevant),
    status: true,
    dateRange: DATE_DEMAND.test(relevant),
    maxFkFilters,
  };
}

/**
 * The query parameters a list endpoint for this entity supports — derived from
 * the entity's own columns, narrowed to what the requirements ask for.
 *
 * Pagination alone is not a usable list API: a real client needs to narrow a
 * list to a lifecycle state and scope it to a parent record, and both are
 * inferable from the schema. Free-text search and date ranges are a step beyond
 * that — genuinely useful on a system whose requirements describe searching and
 * reporting, and pure noise on one whose do not — so `demand` decides those.
 *
 * On a GET, `requestSchema` is what the OpenAPI export turns into `in: 'query'`
 * parameters, so these flow through to the spec, Postman, and the scaffold.
 */
export function listQueryParams(
  entity: Entity,
  demand: ListQueryDemand = FULL_QUERY_DEMAND,
): SchemaField[] {
  const params: SchemaField[] = [
    { name: 'page', type: 'integer', required: false },
    { name: 'limit', type: 'integer', required: false },
  ];
  const columns = entity.columns ?? [];
  const push = (field: SchemaField) => {
    if (!params.some((p) => p.name === field.name)) params.push(field);
  };

  const searchable = columns.some(
    (c) =>
      TEXTUAL.has(c.type.trim().toLowerCase()) &&
      !c.references?.entity &&
      !SERVER_MANAGED.has(c.name.toLowerCase()) &&
      !SENSITIVE.test(c.name),
  );
  if (demand.search && searchable) push({ name: 'search', type: 'string', required: false });

  const status = columns.find((c) => STATUS_COLUMN.test(c.name));
  // The column's own type, not a flat 'string': a lifecycle column is an enum in
  // the schema, and a filter documented as a free string invites a client to send
  // a value the column cannot hold. `jsonType` maps enum→string at the OpenAPI
  // boundary anyway, so the export is unchanged and only the doc gets sharper.
  if (demand.status && status) push({ name: status.name, type: status.type, required: false });

  // Prefer the audit timestamp every entity carries; fall back to whatever
  // domain date the entity actually has (issued_at, sent_at, scheduled_for…).
  const dateColumn =
    columns.find((c) => c.name.toLowerCase() === 'created_at') ??
    columns.find((c) => c.type.trim().toLowerCase().startsWith('timestamp')) ??
    columns.find((c) => c.type.trim().toLowerCase() === 'date');
  if (demand.dateRange && dateColumn) {
    const base = dateColumn.name.replace(/_at$/i, '');
    push({ name: `${base}_from`, type: 'string', required: false });
    push({ name: `${base}_to`, type: 'string', required: false });
  }

  for (const fk of foreignKeys(entity).slice(0, demand.maxFkFilters)) {
    push({ name: fk.name, type: fk.type, required: false });
  }

  return params;
}

/**
 * A **pure** join table: two or more foreign keys and nothing else of its own.
 *
 * The "nothing else" is what makes this safe to act on. `order_items` carries a
 * `quantity`, so it is a resource a client really manipulates and gets its own
 * CRUD; `post_tags` is two ids and a timestamp, and giving it a top-level
 * resource would be noise the parent already exposes.
 */
export function isJunctionEntity(entity: Entity): boolean {
  const fks = foreignKeys(entity);
  if (fks.length < 2) return false;
  return (entity.columns ?? []).every(
    (c) =>
      !!c.references?.entity ||
      c.primaryKey === true ||
      SERVER_MANAGED.has(c.name.toLowerCase()),
  );
}

/**
 * How the database models the user↔role link — the fact the API's user endpoints
 * must agree with.
 *
 * `null` when there is no roles table to reason about.
 */
export type UserRoleCardinality = 'single' | 'many' | null;

const USERS_TABLE = /^users?$/i;
const ROLES_TABLE = /^roles?$/i;

/**
 * Read the actual user↔role cardinality out of the database design.
 *
 * The API and database stages were generated largely independently, so the
 * database could model roles many-to-many (a `user_roles` join table) while the
 * API's create/update-user body accepted a single `role_id` — an API that cannot
 * use the multi-role capability the schema was built for. The fix is for the API
 * to READ this from the schema rather than guess, so the two stay in sync.
 *
 *  - **many**: a pure junction table links users and roles, OR the design
 *    declares a users↔roles many-to-many relation.
 *  - **single**: `users` carries a `role_id` (or a direct FK to roles).
 *  - **null**: no roles table — nothing to reconcile.
 */
export function userRoleCardinality(design: DatabaseDesign): UserRoleCardinality {
  const entities = design.entities ?? [];
  if (!entities.some((e) => ROLES_TABLE.test(e.name.trim()))) return null;

  const links = (entity: Entity, table: RegExp): boolean =>
    (entity.columns ?? []).some(
      (c) => !!c.references && table.test(c.references.entity.trim()),
    );

  const hasJunction = entities.some(
    (e) => isJunctionEntity(e) && links(e, USERS_TABLE) && links(e, ROLES_TABLE),
  );
  if (hasJunction) return 'many';

  const m2mRelation = (design.relations ?? []).some(
    (r) =>
      r.type === 'many-to-many' &&
      ((USERS_TABLE.test(r.from) && ROLES_TABLE.test(r.to)) ||
        (ROLES_TABLE.test(r.from) && USERS_TABLE.test(r.to))),
  );
  if (m2mRelation) return 'many';

  const users = entities.find((e) => USERS_TABLE.test(e.name.trim()));
  const singleFk = (users?.columns ?? []).some(
    (c) =>
      /^role_id$/i.test(c.name) ||
      (!!c.references && ROLES_TABLE.test(c.references.entity.trim())),
  );
  return singleFk ? 'single' : null;
}

/**
 * Make the API's user endpoints agree with a many-to-many role model.
 *
 * The deterministic builder is already consistent (it reaches roles through the
 * junction's nested routes), so this only ever repairs the LLM path, where the
 * model tends to reach for a single `role_id: integer` out of habit. When the
 * schema is many-to-many, any `role_id` field in a user-owning module's
 * request/response schema becomes `role_ids` (an array). Single-role and no-role
 * designs are left untouched — a single `role_id` is correct there.
 */
export function enforceRoleCardinality(
  design: ApiDesign,
  db: DatabaseDesign,
): { design: ApiDesign; changed: boolean } {
  if (userRoleCardinality(db) !== 'many') return { design, changed: false };

  let changed = false;
  const fix = (fields: SchemaField[] | undefined): SchemaField[] | undefined => {
    if (!Array.isArray(fields)) return fields;
    return fields.map((f) => {
      if (/^role_id$/i.test(f.name)) {
        changed = true;
        return { ...f, name: 'role_ids', type: 'array' };
      }
      return f;
    });
  };

  const modules = design.modules.map((m) => {
    const coversUsers =
      (m.coveredEntities ?? []).some((e) => USERS_TABLE.test(e.trim())) ||
      /users/i.test(m.name) ||
      /\/users(?:\/|$)/i.test(m.basePath);
    if (!coversUsers) return m;
    return {
      ...m,
      endpoints: m.endpoints.map((ep) => ({
        ...ep,
        requestSchema: fix(ep.requestSchema) ?? ep.requestSchema,
        responseSchema: fix(ep.responseSchema) ?? ep.responseSchema,
      })),
    };
  });

  return changed ? { design: { ...design, modules }, changed } : { design, changed };
}

export function buildAuthModule(): ApiModule {
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
    coveredEntities: [],
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
        requestSchema: [{ name: 'refreshToken', type: 'string', required: true }],
        responseSchema: tokenResponse,
        statusCodes: [200, 401],
      },
    ],
  };
}

/** The five standard REST endpoints for one entity. */
export function buildEntityModule(
  entity: Entity,
  demand: ListQueryDemand = FULL_QUERY_DEMAND,
): ApiModule {
  const resource = entity.name;
  const basePath = `/api/${resource}`;

  const responseSchema: SchemaField[] = (entity.columns ?? []).map((c) => ({
    name: c.name,
    type: c.type,
    required: !c.nullable,
  }));
  const writeSchema: SchemaField[] = (entity.columns ?? [])
    .filter((c) => !SERVER_MANAGED.has(c.name.toLowerCase()))
    .map((c) => ({ name: c.name, type: c.type, required: !c.nullable }));

  return {
    name: capitalize(resource),
    basePath,
    coveredEntities: [entity.name],
    endpoints: [
      {
        method: 'GET',
        path: basePath,
        summary: `List ${resource}.`,
        requestSchema: listQueryParams(entity, demand),
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

/**
 * Build REST groups for the entities in scope.
 *
 * Nested routes always hang off the **parent's** module (`/api/customers/:id/orders`
 * lives in `Customers`), never off the child's. Both are valid REST; only one
 * survives the scaffold, which mounts a group's endpoints under its own basePath
 * — the same path declared in `Orders` would generate `/orders/:id/orders`.
 */
export function buildRestApi(
  databaseDesign: DatabaseDesign,
  options: BuildRestApiOptions = {},
): RestApiBuild {
  const all = databaseDesign.entities ?? [];
  const byName = new Map(all.map((e) => [e.name, e]));
  const scope = options.only
    ? all.filter((e) => options.only!.includes(e.name))
    : all;
  const inScope = new Set(scope.map((e) => e.name));

  const parentOf = (entity: Entity): Entity | null => {
    for (const fk of foreignKeys(entity)) {
      const parent = byName.get(fk.references!.entity);
      if (parent && parent.name !== entity.name) return parent;
    }
    return null;
  };

  // One demand per entity, so the nested child-collection endpoint below asks the
  // same question of the same entity as its own list endpoint did.
  const demandFor = (entity: Entity): ListQueryDemand =>
    options.queryScope
      ? queryDemandFor(entity, options.queryScope)
      : FULL_QUERY_DEMAND;

  const modules = new Map<string, ApiModule>();
  const excludedEntities: ExcludedEntity[] = [];
  const nestedOnly: Entity[] = [];

  for (const entity of scope) {
    const parent = parentOf(entity);
    // A junction only earns nested-only treatment when we're building its parent
    // too. In a repair run the parent's group is the model's and untouchable, so
    // the link table gets a resource of its own rather than no coverage at all.
    if (isJunctionEntity(entity) && parent && inScope.has(parent.name)) {
      nestedOnly.push(entity);
      continue;
    }
    modules.set(entity.name, buildEntityModule(entity, demandFor(entity)));
  }

  for (const entity of nestedOnly) {
    const parent = parentOf(entity)!;
    const parentModule = modules.get(parent.name);
    if (!parentModule) {
      modules.set(entity.name, buildEntityModule(entity, demandFor(entity)));
      continue;
    }
    parentModule.endpoints.push(...junctionEndpoints(entity, parent));
    excludedEntities.push({
      entity: entity.name,
      reason: `Join table between ${parent.name} and ${otherSide(entity, parent)} — no resource of its own; managed through the ${parentModule.name} resource's nested routes (${parentModule.basePath}/:id/${entity.name}).`,
    });
  }

  // Child collections, on the parent that owns them.
  for (const entity of scope) {
    if (nestedOnly.includes(entity)) continue;
    const parent = parentOf(entity);
    if (!parent || !inScope.has(parent.name)) continue;
    const parentModule = modules.get(parent.name);
    if (!parentModule) continue;
    parentModule.endpoints.push(
      childCollectionEndpoint(entity, parent, demandFor(entity)),
    );
  }

  const built = [...modules.values()];
  if (options.source) for (const m of built) m.source = options.source;
  if (options.includeAuth) built.unshift(buildAuthModule());

  return { modules: built, excludedEntities };
}

/**
 * The persistence boundary's guarantee: return a design in which **every** entity
 * is covered or excluded, filling any remainder with deterministic groups.
 *
 * Tagged `generated-fallback` so the UI can say out loud that nobody designed
 * these — a generic resource the user should look at beats a table with no API
 * and no mention of why.
 */
export function ensureEntityCoverage(
  design: ApiDesign,
  databaseDesign: DatabaseDesign,
  queryScope?: QueryScope,
): ApiDesign {
  const names = (databaseDesign.entities ?? []).map((e) => e.name);
  const resolved = withResolvedCoverage(design, names);
  const coverage = validateEntityCoverage(resolved, names);
  if (coverage.ok) return resolved;

  const filler = buildRestApi(databaseDesign, {
    only: coverage.missing,
    source: 'generated-fallback',
    // Without this the filler groups carried the full query surface while every
    // model-authored group beside them carried the narrowed one — two
    // conventions inside a single API design, inherited by the OpenAPI spec,
    // the Postman collection and the scaffold.
    queryScope,
  });
  return withResolvedCoverage(
    mergeMissingCoverage(resolved, filler, coverage.missing),
    names,
  );
}

/** Query parameters that are always allowed, whatever the requirements say. */
const ALWAYS_ALLOWED_PARAMS = /^(?:page|limit|per_?page|offset|cursor|sort|order|sort_?by)$/i;

/** Names a model reaches for when it means free-text search. */
const SEARCH_PARAM = /^(?:search|q|query|keyword|term|filter)$/i;

/** A date-range bound, in the conventions a model actually emits. */
const DATE_RANGE_PARAM =
  /_(?:from|to|after|before)$|^(?:from|to|start_?date|end_?date|date_?from|date_?to)$/i;

/**
 * Trim a model-authored list endpoint's query surface to what the requirements
 * asked for.
 *
 * The deterministic builder was already scale-aware, but the *model* path — the
 * one that produced the reported over-broad design — had only the prompt behind
 * it. That is the wrong half to leave unguarded: the prompt is the primary
 * defence everywhere in this codebase precisely because a deterministic backstop
 * sits behind it, and the tech stack got both while this got one.
 *
 * **Removal only, and only of optional filters.** Dropping an optional query
 * parameter cannot break a contract — a client that never sends it behaves
 * identically — whereas adding or renaming one could. `page`/`limit` and the
 * ordering parameters are never touched, and above the small tier
 * `queryDemandFor` returns the full surface, so this is a no-op there.
 */
export function enforceQuerySurface(
  design: ApiDesign,
  databaseDesign: DatabaseDesign,
  scope: QueryScope,
): { design: ApiDesign; trimmed: string[] } {
  const byName = new Map((databaseDesign.entities ?? []).map((e) => [e.name, e]));
  const trimmed: string[] = [];

  const modules = design.modules.map((module) => {
    // The group's own entity decides the demand; a group covering several (or
    // none, like Auth) is left alone rather than judged by an arbitrary member.
    const covered = module.coveredEntities ?? [];
    const entity = covered.length === 1 ? byName.get(covered[0]) : undefined;
    if (!entity) return module;

    const demand = queryDemandFor(entity, scope);
    if (demand.search && demand.dateRange && demand.maxFkFilters >= 5) return module;

    const fkNames = new Set(foreignKeys(entity).map((c) => c.name.toLowerCase()));
    const endpoints = module.endpoints.map((endpoint) => {
      if (endpoint.method !== 'GET' || endpoint.path !== module.basePath) {
        return endpoint;
      }
      let keptFks = 0;
      const requestSchema = (endpoint.requestSchema ?? []).filter((param) => {
        const name = param.name ?? '';
        if (ALWAYS_ALLOWED_PARAMS.test(name)) return true;
        if (!demand.search && SEARCH_PARAM.test(name)) {
          trimmed.push(`${module.name}.${name}`);
          return false;
        }
        if (!demand.dateRange && DATE_RANGE_PARAM.test(name)) {
          trimmed.push(`${module.name}.${name}`);
          return false;
        }
        if (fkNames.has(name.toLowerCase())) {
          if (keptFks >= demand.maxFkFilters) {
            trimmed.push(`${module.name}.${name}`);
            return false;
          }
          keptFks += 1;
        }
        return true;
      });
      return { ...endpoint, requestSchema };
    });
    return { ...module, endpoints };
  });

  return { design: { ...design, modules }, trimmed };
}

// ── helpers ────────────────────────────────────────────────────────────────

/** The entity a junction links to, other than `parent`. */
function otherSide(junction: Entity, parent: Entity): string {
  const other = foreignKeys(junction).find(
    (c) => c.references!.entity !== parent.name,
  );
  return other?.references?.entity ?? 'the linked resource';
}

function junctionEndpoints(junction: Entity, parent: Entity): ApiEndpoint[] {
  const base = `/api/${parent.name}/:id/${junction.name}`;
  const link = foreignKeys(junction).find(
    (c) => c.references!.entity !== parent.name,
  );
  const linkColumn = link?.name ?? 'linkId';
  const columns: SchemaField[] = (junction.columns ?? []).map((c) => ({
    name: c.name,
    type: c.type,
    required: !c.nullable,
  }));
  return [
    {
      method: 'GET',
      path: base,
      summary: `List ${otherSide(junction, parent)} linked to a ${singular(parent.name)}.`,
      requestSchema: [],
      responseSchema: columns,
      statusCodes: [200, 404],
    },
    {
      method: 'POST',
      path: base,
      summary: `Link ${otherSide(junction, parent)} to a ${singular(parent.name)}.`,
      requestSchema: columns.filter(
        (c) => !SERVER_MANAGED.has(c.name.toLowerCase()) && c.name !== parentKey(junction, parent),
      ),
      responseSchema: columns,
      statusCodes: [201, 400, 404],
    },
    {
      method: 'DELETE',
      path: `${base}/:${linkColumn}`,
      summary: `Unlink ${otherSide(junction, parent)} from a ${singular(parent.name)}.`,
      requestSchema: [],
      responseSchema: [],
      statusCodes: [204, 404],
    },
  ];
}

/** The junction column pointing back at the parent — it's already in the path. */
function parentKey(junction: Entity, parent: Entity): string | null {
  return (
    foreignKeys(junction).find((c) => c.references!.entity === parent.name)
      ?.name ?? null
  );
}

function childCollectionEndpoint(
  child: Entity,
  parent: Entity,
  demand: ListQueryDemand = FULL_QUERY_DEMAND,
): ApiEndpoint {
  return {
    method: 'GET',
    path: `/api/${parent.name}/:id/${child.name}`,
    summary: `List ${child.name} for a ${singular(parent.name)}.`,
    // The parent is already pinned by the path, so its FK filter is redundant.
    requestSchema: listQueryParams(child, demand).filter(
      (p) => p.name !== parentKey(child, parent),
    ),
    responseSchema: (child.columns ?? []).map((c) => ({
      name: c.name,
      type: c.type,
      required: !c.nullable,
    })),
    statusCodes: [200, 404],
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function singular(table: string): string {
  return table.endsWith('s') ? table.slice(0, -1) : table;
}

// `singularNoun` (prose matching) now lives in `text.ts`, because the
// cross-tenant shared-entity rule needs exactly the same stemming to decide
// whether "patient records" and a `patients` table are the same noun. `singular`
// above stays local and separate: it only strips a trailing "s" and exists to
// build readable endpoint summaries, where mangling `addresses` into `addresse`
// would be visible in the output rather than a silent failed match.
