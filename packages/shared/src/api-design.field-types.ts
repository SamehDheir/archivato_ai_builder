/**
 * Field types the API design shares with the database design.
 *
 * The API stage is generated from the database stage, and its `SchemaField.type`
 * uses the same vocabulary as `EntityColumn.type` (`uuid`, `string`, `integer`,
 * `decimal`, `boolean`, `timestamp`, `enum`, `json`) — the OpenAPI export maps
 * that to JSON Schema at the boundary, and the web view prints it raw. So the
 * two artifacts are supposed to agree by construction.
 *
 * They did not. A real 12-module, 48-endpoint design typed **every** id as
 * `integer` — path params, request bodies, response bodies — against a schema
 * whose primary keys are all `uuid`. Any team building against that doc would
 * assume auto-incrementing integers and hit the mismatch on their first insert.
 *
 * The cause was not a bad model. `describeEntity` handed the API designer its
 * entities' column **names and nothing else** — no types, no PK/FK markers — so
 * the model was told "field names match the data model" and shown no types to
 * match. It filled the gap with the REST convention that dominates its training
 * data. The deterministic fallback, which copies `c.type` straight off the
 * column, was correct the whole time: the offline output was right and the paid
 * one was wrong, the same inversion as `enforcePaymentAvailability`.
 *
 * That is the third time this shape has bitten this pipeline (the QA planner
 * asked for tools "matched to the stack" with no stack in its prompt; the schema
 * designer was told to respect business rules that were never printed). Hence
 * both halves here, the standing division of labour: the agent now sends real
 * types, and this module enforces them on the output regardless.
 *
 * Pure and runtime-free.
 */

import type {
  ApiDesign,
  ApiEndpoint,
  ApiModule,
  ApiTypeCorrection,
  SchemaField,
} from './api-design';
import type { DatabaseDesign, Entity, EntityColumn } from './database-design';
import { singularNoun } from './text';

export interface FieldTypeReconciliation {
  design: ApiDesign;
  /** Empty when the API design already agreed with the schema. */
  corrections: ApiTypeCorrection[];
}

// ── the index ──────────────────────────────────────────────────────────────

export interface SchemaTypeIndex {
  /** entity (lowercased) → its columns by lowercased name. */
  columns: Map<string, Map<string, EntityColumn>>;
  /** entity (lowercased) → the type of its primary key. */
  primaryKey: Map<string, string>;
  /** entity (lowercased) → its declared name, for reporting. */
  displayName: Map<string, string>;
  /** singular noun → entity key, so `patient_record_id` finds `patient_records`. */
  byNoun: Map<string, string>;
}

/**
 * Index a database design for type lookups.
 *
 * `byNoun` is what lets a foreign key resolve across entities: a field called
 * `doctor_id` on the appointments module is not a column the module's own entity
 * necessarily declares in the model's output, but `doctors.id` is knowable, and
 * its type is the answer. Built from the singular of each entity name so both
 * `doctor_id` and `doctors_id` land on the same table.
 */
export function buildSchemaTypeIndex(db: DatabaseDesign | null | undefined): SchemaTypeIndex {
  const index: SchemaTypeIndex = {
    columns: new Map(),
    primaryKey: new Map(),
    displayName: new Map(),
    byNoun: new Map(),
  };

  for (const entity of db?.entities ?? []) {
    const name = entity.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();

    const columns = new Map<string, EntityColumn>();
    for (const column of entity.columns ?? []) {
      if (column?.name) columns.set(column.name.trim().toLowerCase(), column);
    }
    index.columns.set(key, columns);
    index.displayName.set(key, name);

    const pk = (entity.columns ?? []).find((c) => c.primaryKey) ??
      (entity.columns ?? []).find((c) => c.name?.trim().toLowerCase() === 'id');
    if (pk?.type) index.primaryKey.set(key, pk.type.trim());

    index.byNoun.set(key, key);
    index.byNoun.set(singularNoun(key), key);
  }
  return index;
}

/** The entity a `<noun>_id` field points at, or null. */
function entityForNoun(index: SchemaTypeIndex, noun: string): string | null {
  const clean = noun.trim().toLowerCase();
  return index.byNoun.get(clean) ?? index.byNoun.get(singularNoun(clean)) ?? null;
}

/** Where a field's authoritative type came from. */
export interface ResolvedFieldType {
  /** The entity that decided it, for reporting. */
  entity: string;
  type: string;
}

/**
 * The database's type for one API schema field, or `null` when the schema has
 * nothing to say about it.
 *
 * `null` is the important half. A response field like `accessToken`, a `page`
 * query parameter, or a computed `total_count` is not a column, and inventing a
 * type for it would be the same guessing bug this module exists to fix, just in
 * the other direction. **Only a field that genuinely maps to a column is ever
 * rewritten.**
 *
 * Resolution runs in confidence order:
 *  1. an exact column name on one of the context entities — the strongest claim;
 *  2. bare `id` — the primary key of the endpoint's own resource;
 *  3. `<noun>_id` — the primary key of the entity that noun names, which is what
 *     makes `branch_id`, `doctor_id` and `patient_record_id` resolve even when
 *     the model invented the field rather than copying the column.
 */
export function resolveFieldType(
  index: SchemaTypeIndex,
  fieldName: string,
  contextEntities: readonly string[],
): ResolvedFieldType | null {
  const name = fieldName?.trim().toLowerCase();
  if (!name) return null;

  // A plural `_ids` field is a collection, which this codebase types `array`
  // (see `enforceRoleCardinality`). Rewriting it to the referenced primary key's
  // scalar type would silently undo that fix.
  if (name.endsWith('_ids')) return null;

  for (const entity of contextEntities) {
    const column = index.columns.get(entity)?.get(name);
    if (column?.type) {
      return { entity: index.displayName.get(entity) ?? entity, type: column.type.trim() };
    }
  }

  if (name === 'id') {
    for (const entity of contextEntities) {
      const pk = index.primaryKey.get(entity);
      if (pk) return { entity: index.displayName.get(entity) ?? entity, type: pk };
    }
    return null;
  }

  const fk = /^(.+)_id$/.exec(name);
  if (fk) {
    const target = entityForNoun(index, fk[1]);
    const pk = target ? index.primaryKey.get(target) : undefined;
    if (target && pk) {
      return { entity: index.displayName.get(target) ?? target, type: pk };
    }
  }

  return null;
}

/**
 * The entities an endpoint's fields are about, most specific first.
 *
 * The endpoint **path** is consulted before the module's `coveredEntities`, and
 * the *last* entity-shaped segment wins, because a nested route describes the
 * child: `/api/patients/:id/appointments` returns appointments, not patients, so
 * its `id` is an appointment's. Ordering this the other way would type the whole
 * nested response off the parent.
 */
export function contextEntitiesFor(
  index: SchemaTypeIndex,
  module: Pick<ApiModule, 'basePath' | 'coveredEntities'>,
  endpoint?: Pick<ApiEndpoint, 'path'>,
): string[] {
  const fromPath: string[] = [];
  const path = endpoint?.path ?? module.basePath ?? '';
  for (const segment of path.split('/')) {
    if (!segment || segment.startsWith(':') || segment.toLowerCase() === 'api') continue;
    const entity = entityForNoun(index, segment.replace(/-/g, '_'));
    if (entity) fromPath.unshift(entity);
  }

  const covered = (module.coveredEntities ?? [])
    .map((e) => e?.trim().toLowerCase())
    .filter((e): e is string => !!e && index.columns.has(e));

  const context = [...new Set([...fromPath, ...covered])];
  if (context.length > 0) return context;

  // The Auth module is the one group that covers no entity by construction — our
  // own prompt asks for it with `coveredEntities: []` — yet `POST /api/auth/
  // register` plainly returns the created user, whose id is a uuid. With no
  // context its `id` resolved to nothing and stayed `integer`, which is the exact
  // bug, surviving in the one endpoint every consumer calls first.
  //
  // Narrow on purpose: this is a fact about OUR generator's convention, not an
  // inference about the client's domain, so it fires only for an auth-shaped
  // module that covers nothing and only when a users table actually exists.
  if (AUTH_MODULE.test(module.basePath ?? '')) {
    const users = [...index.columns.keys()].find((e) => USER_ENTITY.test(e));
    if (users) return [users];
  }
  return context;
}

const AUTH_MODULE = /(?:^|\/)auth(?:\/|$)/i;
const USER_ENTITY = /^users?$|^accounts?$/i;

// ── comparison ─────────────────────────────────────────────────────────────

/**
 * Do these two type names mean the same thing?
 *
 * Compared after light normalization rather than by string equality, because a
 * model writes the same type several ways and rewriting `varchar` to `string` on
 * every field would bury the corrections that matter under cosmetic noise. What
 * this deliberately does NOT forgive is `integer` for a `uuid` — different
 * storage, different generation strategy, and the whole reason this exists.
 */
export function sameFieldType(a: string, b: string): boolean {
  return normalizeTypeName(a) === normalizeTypeName(b);
}

/** Spellings of one type, folded together. */
const TYPE_ALIASES: Record<string, string> = {
  varchar: 'string',
  char: 'string',
  text: 'string',
  str: 'string',
  int: 'integer',
  int4: 'integer',
  int8: 'integer',
  bigint: 'integer',
  smallint: 'integer',
  serial: 'integer',
  bigserial: 'integer',
  number: 'decimal',
  numeric: 'decimal',
  float: 'decimal',
  double: 'decimal',
  money: 'decimal',
  bool: 'boolean',
  datetime: 'timestamp',
  timestamptz: 'timestamp',
  jsonb: 'json',
  guid: 'uuid',
};

function normalizeTypeName(type: string): string {
  const base = (type ?? '')
    .trim()
    .toLowerCase()
    // `varchar(255)`, `timestamp with time zone`, `numeric(10,2)`
    .replace(/\(.*$/, '')
    .replace(/\s+with\s+time\s+zone$/, '')
    .trim();
  return TYPE_ALIASES[base] ?? base;
}

// ── the reconciliation pass ────────────────────────────────────────────────

/**
 * Rewrite every API schema field whose type contradicts the database, and report
 * what changed.
 *
 * **The database is the source of truth**, unconditionally: it is the artifact
 * the migration, the Prisma schema, the SQL export and the scaffold are all
 * generated from, so an API doc that disagrees with it is wrong by definition
 * even when its own type looks more idiomatic.
 *
 * Corrections are aggregated by (entity, field, from, to) rather than listed per
 * endpoint. On the design that prompted this, `id: integer → uuid` was wrong in
 * ~90 places across 48 endpoints; ninety identical bullet points is a wall of
 * text an owner scrolls past, while eight rows reading "patients.id · integer →
 * uuid · 11 occurrences" is a thing they can actually check.
 *
 * Runs on both paths — the deterministic build already agrees with the schema,
 * so there it is a cheap no-op that also guards against a future regression in
 * the builder.
 */
export function reconcileApiFieldTypes(
  design: ApiDesign,
  db: DatabaseDesign | null | undefined,
): FieldTypeReconciliation {
  const index = buildSchemaTypeIndex(db);
  if (index.columns.size === 0) return { design, corrections: [] };

  const tally = new Map<string, ApiTypeCorrection>();
  let changed = false;

  const fixFields = (
    fields: SchemaField[] | undefined,
    context: readonly string[],
  ): SchemaField[] | undefined => {
    if (!Array.isArray(fields)) return fields;
    return fields.map((field) => {
      if (!field?.name || typeof field.type !== 'string') return field;
      const resolved = resolveFieldType(index, field.name, context);
      if (!resolved || field.type === resolved.type) return field;

      // Two different questions, deliberately separated.
      //
      // The field is ALWAYS rewritten to the schema's exact spelling, so the
      // document ends up in one vocabulary — the owner should not read `number`
      // on one endpoint and `decimal` on the next for the same column.
      //
      // It is only REPORTED when the two types actually mean different things.
      // Listing `varchar(255) → string` beside `integer → uuid` would bury the
      // correction that matters under cosmetic noise, and a table nobody reads is
      // the same as no table.
      changed = true;
      if (!sameFieldType(field.type, resolved.type)) {
        const key = `${resolved.entity}|${field.name}|${field.type}|${resolved.type}`;
        const existing = tally.get(key);
        if (existing) existing.occurrences += 1;
        else {
          tally.set(key, {
            entity: resolved.entity,
            field: field.name,
            from: field.type,
            to: resolved.type,
            occurrences: 1,
          });
        }
      }
      return { ...field, type: resolved.type };
    });
  };

  const modules = design.modules.map((module) => ({
    ...module,
    endpoints: (module.endpoints ?? []).map((endpoint) => {
      // Deliberately NOT short-circuited on an empty context. `<noun>_id`
      // resolution needs no context — it reads the referenced table's key
      // directly — so skipping context-less endpoints silently switched that rule
      // off for exactly the modules most likely to need it.
      const context = contextEntitiesFor(index, module, endpoint);
      return {
        ...endpoint,
        requestSchema: fixFields(endpoint.requestSchema, context) ?? endpoint.requestSchema,
        responseSchema: fixFields(endpoint.responseSchema, context) ?? endpoint.responseSchema,
      };
    }),
  }));

  const corrections = [...tally.values()].sort(
    (a, b) => b.occurrences - a.occurrences || a.entity.localeCompare(b.entity),
  );

  return {
    design: changed ? { ...design, modules } : design,
    corrections,
  };
}

// ── path parameters ────────────────────────────────────────────────────────

/**
 * The database type behind a `:param` in an endpoint path.
 *
 * Path params live in the path string, not in `requestSchema`, so the
 * reconciliation above cannot reach them — yet `GET /api/patients/:id` is
 * exactly where a consumer first meets the id type. The OpenAPI export used to
 * type every path param `string` with no format; with this it can emit
 * `format: uuid` when the key really is one.
 */
export function pathParamType(
  index: SchemaTypeIndex,
  path: string,
  param: string,
  module?: Pick<ApiModule, 'basePath' | 'coveredEntities'>,
): string | null {
  // `:id` means "the resource named by the segment before it", which is more
  // precise than the module's covered list on a nested route.
  const segments = path.split('/').filter(Boolean);
  const at = segments.indexOf(`:${param}`);
  const owner = at > 0 ? entityForNoun(index, segments[at - 1].replace(/-/g, '_')) : null;

  const context = [
    ...(owner ? [owner] : []),
    ...(module ? contextEntitiesFor(index, module, { path }) : []),
  ];
  return resolveFieldType(index, param, context)?.type ?? null;
}

// ── the prompt side ────────────────────────────────────────────────────────

/**
 * How many columns of one entity the prompt spells out.
 *
 * The old value was 10, applied silently: a wider table's tail columns were
 * invisible to the model, which then could not design them and had no way to
 * know they existed. 24 covers essentially every real table here, and when it
 * does bite, the line below says so out loud rather than pretending the entity
 * ends there.
 *
 * Cost is prompt tokens, not output tokens — this does not eat into
 * `CHUNK_MAX_TOKENS`, which is what `MAX_ENTITIES_PER_CALL` is sized against.
 */
const MAX_PROMPT_COLUMNS = 24;

/**
 * One entity's columns WITH their types, for the API designer's prompt.
 *
 * This line is the fix for the root cause: the model cannot copy a type it was
 * never shown, and it was previously shown names alone. Marking the primary key
 * and the foreign-key targets matters as much as the type itself — it is what
 * tells the model that `/api/patients/:id` takes a uuid rather than leaving it
 * to infer one from the word "id".
 */
export function describeColumns(entity: Entity): string {
  const columns = entity.columns ?? [];
  const shown = columns.slice(0, MAX_PROMPT_COLUMNS).map((c) => {
    const flags = [
      c.primaryKey ? 'PK' : '',
      c.references?.entity ? `FK→${c.references.entity}` : '',
      c.unique ? 'UNIQUE' : '',
      c.nullable ? 'NULL' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `${c.name} ${c.type}${flags ? ` ${flags}` : ''}`;
  });
  if (columns.length > shown.length) {
    shown.push(`…and ${columns.length - shown.length} more columns`);
  }
  return shown.join(', ');
}
