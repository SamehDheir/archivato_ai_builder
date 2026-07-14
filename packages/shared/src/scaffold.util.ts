/**
 * Shared internals for the scaffold builders (backend + frontend).
 *
 * These live apart from `scaffold.ts` for one reason that matters: both builders
 * must derive the SAME names from the same design. The frontend client's
 * `create()` calls the backend controller's `create()` handler because both are
 * produced by `assignHandlers()` here — not because two files happen to agree.
 *
 * Internal to the scaffold builders; not re-exported from the package index.
 */

import type { ApiEndpoint, HttpMethod, SchemaField } from './api-design';

/**
 * Everything a designed path is allowed to contain.
 *
 * Design artifacts are LLM output derived from the user's own words, and they
 * get interpolated into generated source — into `'${path}'` string literals,
 * `@Controller('…')` decorators, and file paths. A quote, backtick, `$`, or
 * newline in a path would break out of the literal it lands in: at best the
 * generated project stops compiling (the one promise this builder makes), at
 * worst it carries code the user never wrote into their own repo. Strip to a
 * charset that is valid in a URL path and inert in every literal we emit.
 */
const SAFE_PATH_CHARS = /[^A-Za-z0-9_\-./:{}~]/g;

const HTTP_METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Fields the server manages — never accepted in a request DTO or a form. */
export const SERVER_MANAGED = new Set([
  'id',
  'created_at',
  'updated_at',
  'createdat',
  'updatedat',
  'password_hash',
  'passwordhash',
]);

/** One endpoint, with every name the generators need already resolved. */
export interface Handler {
  endpoint: ApiEndpoint;
  /** Unique method name within the module, e.g. `findAll`, `create`, `update2`. */
  name: string;
  /** Path relative to the controller base, e.g. ':id' or '' for the root. */
  subPath: string;
  /** Path params in order, e.g. ['id']. */
  params: string[];
  /** DTO/body class name when the endpoint takes a request body, else null. */
  dtoName: string | null;
  dtoFields: SchemaField[];
}

/**
 * Name every endpoint in a module. Names are unique within the module (a second
 * `GET /x` becomes `findAll2`), so controller, service, DTOs, the frontend
 * client, and the pages can all refer to the same handler without colliding.
 */
export function assignHandlers(endpoints: ApiEndpoint[]): Handler[] {
  const used = new Set<string>();
  return endpoints.map((endpoint) => {
    const subPath = relativePath(endpoint.path);
    const params = [...subPath.matchAll(/:(\w+)/g)].map((m) => m[1]);

    const base = baseHandlerName(endpoint.method, params.length > 0);
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);

    const takesBody =
      ['POST', 'PUT', 'PATCH'].includes(endpoint.method) &&
      dtoFields(endpoint.requestSchema).length > 0;

    return {
      endpoint,
      name,
      subPath,
      params,
      dtoName: takesBody ? `${pascal(name)}Dto` : null,
      dtoFields: takesBody ? dtoFields(endpoint.requestSchema) : [],
    };
  });
}

/** Request-schema fields a client may send (server-managed ones are dropped). */
export function dtoFields(schema: SchemaField[]): SchemaField[] {
  return (schema ?? []).filter((f) => !SERVER_MANAGED.has(f.name.toLowerCase()));
}

function baseHandlerName(method: string, hasId: boolean): string {
  switch (method) {
    case 'GET':
      return hasId ? 'findOne' : 'findAll';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'remove';
    default:
      return 'handle';
  }
}

/**
 * Ensure the derived key (via `keyOf`) is unique across items by suffixing the
 * `name` of later collisions (" 2", " 3", …). Works for any item with a `name`.
 */
export function uniquifyNames<T extends { name: string }>(
  items: T[],
  keyOf: (item: T) => string,
): T[] {
  const counts = new Map<string, number>();
  return (items ?? []).map((item) => {
    const key = keyOf(item).toLowerCase();
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    return seen === 0 ? item : { ...item, name: `${item.name} ${seen + 1}` };
  });
}

/**
 * The Prisma datasource provider for a designed database type. Shared with the
 * deployment builder so the container it starts can't drift from the schema the
 * app expects to connect to.
 */
export function prismaProvider(databaseType: string): string {
  const t = (databaseType || '').toLowerCase();
  if (t.includes('mysql') || t.includes('maria')) return 'mysql';
  if (t.includes('sqlite')) return 'sqlite';
  if (t.includes('sqlserver') || t.includes('mssql')) return 'sqlserver';
  if (t.includes('mongo')) return 'mongodb';
  return 'postgresql';
}

// ── Type mapping ─────────────────────────────────────────────────────────────

/** The TypeScript type a designed field type maps to. */
export function tsType(rawType: string): string {
  return fieldKind(rawType).ts;
}

/**
 * A designed field type, resolved once into everything the generators need: the
 * TS type, the class-validator decorator, and the HTML input type.
 */
export function fieldKind(rawType: string): {
  ts: string;
  validator: string;
  input: 'text' | 'number' | 'checkbox' | 'datetime-local';
} {
  const t = (rawType || '').toLowerCase();
  if (/(^| )(int|integer|serial|bigint|smallint)/.test(t))
    return { ts: 'number', validator: 'IsInt', input: 'number' };
  if (/(decimal|numeric|float|double|real|money)/.test(t))
    return { ts: 'number', validator: 'IsNumber', input: 'number' };
  if (/(bool)/.test(t))
    return { ts: 'boolean', validator: 'IsBoolean', input: 'checkbox' };
  if (/(timestamp|datetime|^date$|^date )/.test(t))
    return { ts: 'string', validator: 'IsDateString', input: 'datetime-local' };
  if (/(json)/.test(t))
    return { ts: 'Record<string, unknown>', validator: 'IsObject', input: 'text' };
  return { ts: 'string', validator: 'IsString', input: 'text' };
}

// ── Path helpers ─────────────────────────────────────────────────────────────

/** A designed path reduced to inert characters (see `SAFE_PATH_CHARS`). */
export function safePath(p: string): string {
  return (p ?? '').replace(SAFE_PATH_CHARS, '');
}

/**
 * Strip the leading `/api` and surrounding slashes from a designed path — and
 * sanitize it. Every generator reaches a path through here or `safePath`, so
 * this is the one place the charset has to hold.
 */
export function stripApi(p: string): string {
  return safePath(p)
    .replace(/^\/?api/i, '')
    .replace(/^\/+|\/+$/g, '');
}

/** The controller base path (no leading slash), e.g. `/api/users` → `users`. */
export function controllerBase(basePath: string, slug: string): string {
  return stripApi(basePath) || slug;
}

/**
 * An endpoint's path relative to its module base — the arg to `@Get(...)`.
 * `/api/users/:id` (base `/api/users`) → `:id`; `/api/users` → ``.
 */
export function relativePath(endpointPath: string): string {
  const segments = stripApi(endpointPath).split('/').filter(Boolean);
  // Drop the first segment (the resource, already the controller base) and keep
  // the remainder (ids / sub-resources). This keeps nested paths intact.
  return segments.slice(1).join('/');
}

// ── Casing helpers ───────────────────────────────────────────────────────────

export function words(s: string): string[] {
  return (s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function pascal(s: string): string {
  const w = words(s);
  if (w.length === 0) return 'Resource';
  return w.map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()).join('');
}

export function camel(s: string): string {
  const p = pascal(s);
  return p ? p[0].toLowerCase() + p.slice(1) : p;
}

export function kebab(s: string): string {
  const w = words(s);
  return w.length ? w.map((x) => x.toLowerCase()).join('-') : 'resource';
}

/**
 * A designed HTTP method, whitelisted. The type says `HttpMethod`, but the value
 * came from a model — and it is emitted both as a decorator name (`@Get`) and
 * inside a string literal (`method: 'GET'`), so an unvetted one could inject.
 * Anything unrecognized reads as a GET.
 */
export function httpMethod(method: string): HttpMethod {
  const key = (method || '').trim().toUpperCase();
  return (HTTP_METHODS.includes(key) ? key : 'GET') as HttpMethod;
}

/** The Nest route decorator for a method: `GET` → `Get`. */
export function pascalMethod(method: string): string {
  const key = httpMethod(method);
  return key.charAt(0) + key.slice(1).toLowerCase();
}

/** Collapse whitespace, so text can't break out of a single-line comment. */
export function oneLine(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Design text inside a `/** … *\/` comment — a stray `*\/` would end it early. */
export function comment(text: string): string {
  return oneLine(text).replace(/\*\//g, '*\\/');
}

/**
 * A name going inside a Prisma `"…"` literal (`@@map`, `@map`). A quote or a
 * backslash there is a schema that won't `prisma validate`.
 */
export function mapName(name: string): string {
  return (name ?? '').replace(/["\\\r\n]/g, '');
}

export function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
