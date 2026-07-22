/**
 * The API Design — output of the API Designer stage (spec Step 6).
 * Endpoints grouped by module, each with method, request/response schema, and
 * status codes. Derived from the Database Design + System Design services.
 */

import type { LocalizedArtifact } from './artifact-language';
import type { GenerationProvenance } from './generation';
import { dedupeBy } from './collections';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SchemaField {
  name: string;
  /** e.g. uuid, string, integer, decimal, boolean, timestamp, json. */
  type: string;
  required: boolean;
}

export interface ApiEndpoint {
  method: HttpMethod;
  /** Full path including the /api prefix, e.g. "/api/users/:id". */
  path: string;
  summary: string;
  /** Body/query fields the client sends. */
  requestSchema: SchemaField[];
  /** Fields returned in the (success) response body. */
  responseSchema: SchemaField[];
  statusCodes: number[];
}

/**
 * How an endpoint group came to exist.
 *
 * Only `generated-fallback` is a warning: it marks a group the code had to build
 * because the model left its entity uncovered even after a repair round-trip, so
 * it is generic CRUD nobody designed. A wholesale deterministic design (no LLM
 * configured, or the call failed) is NOT tagged — that is the expected offline
 * output, not a patch, and flagging every group of it would make the warning
 * meaningless.
 */
export type ApiModuleSource = 'llm' | 'llm-repair' | 'generated-fallback';

export const API_MODULE_SOURCES: readonly ApiModuleSource[] = [
  'llm',
  'llm-repair',
  'generated-fallback',
];

export interface ApiModule {
  /** e.g. Auth, Users, Billing. */
  name: string;
  /** e.g. "/api/users". */
  basePath: string;
  endpoints: ApiEndpoint[];
  /**
   * Database entities this group gives access to, by exact entity name. The
   * coverage accounting that guarantees no entity is silently left without an
   * API. Absent on designs generated before coverage existed — treat missing as
   * "unknown", never as "covers nothing".
   */
  coveredEntities?: string[];
  source?: ApiModuleSource;
}

/** A database entity deliberately left without its own endpoint group. */
export interface ExcludedEntity {
  /** Exact entity name from the database design. */
  entity: string;
  /** Why it needs no resource of its own (a junction table, a nested-only child…). */
  reason: string;
}

export interface ApiDesign extends LocalizedArtifact {
  sessionId: string;
  generatedAt: string;
  /**
   * How this design was produced — see `generation.ts`. Absent = unknown.
   *
   * Artifact-level, and coarser than `ApiModule.source`: this stage is chunked,
   * so a run can be partly model-authored and partly repaired. `llm` here means
   * at least one module came from the model; `fallback` means the whole design
   * was built deterministically.
   */
  generation?: GenerationProvenance;
  modules: ApiModule[];
  /**
   * Entities intentionally not given a resource, each with a justification. The
   * other half of coverage accounting: an entity is valid iff some module covers
   * it or it is declared here.
   */
  excludedEntities?: ExcludedEntity[];
}

// ── Normalization ───────────────────────────────────────────────────────────

export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

/**
 * Coerce a possibly-partial endpoint to a complete, safe-to-consume shape.
 *
 * **Every field here is REQUIRED by the type, and that is exactly the trap**: the
 * artifact is stored as `data Json` and read back with a cast, so nothing at
 * runtime enforces the type. An LLM endpoint that omitted `statusCodes` — or a row
 * written before this normalization existed — flows in as `undefined` and takes
 * out every consumer at once (`for (const c of ep.statusCodes)` in the OpenAPI
 * builder, `.map` in the view, the Postman/scaffold/mock builders). A missing
 * array must read as empty, never as undefined.
 */
/**
 * Force an endpoint path to the absolute form the type promises
 * (`/** Full path including the /api prefix *​/`).
 *
 * Nothing enforced that promise, and models routinely break it — a single real
 * design mixed **three** conventions, sometimes inside one module: `/api/clinics`
 * for the collection but `/:id` for the item, `/` and `/:appointmentId` in the
 * next module, and fully-qualified paths only in the groups the deterministic
 * builder produced. Every downstream consumer trusts the field: the OpenAPI
 * export publishes `/{id}` as a top-level route, the scaffold mounts a
 * controller at the wrong place, and the Postman collection points at nothing.
 *
 * Because this runs at the store's read boundary as well as on write, it also
 * repairs designs already sitting in the table.
 */
function absolutePath(raw: unknown, basePath: string): string {
  const path = typeof raw === 'string' ? raw.trim() : '';
  if (!path) return basePath;
  if (path.startsWith('/api')) return path;
  if (!basePath) return path.startsWith('/') ? path : `/${path}`;
  if (path === '/') return basePath;
  if (path.startsWith(basePath)) return path;

  // A relative path that repeats its own resource ("/orders/:id" under
  // "/api/orders") would otherwise join into "/api/orders/orders/:id". Compared
  // segment-wise rather than with a RegExp built from `basePath` — that string is
  // LLM output and may carry regex metacharacters.
  const base = basePath.replace(/\/+$/, '');
  const resource = base.split('/').filter(Boolean).pop();
  const rest = path.replace(/^\/+/, '').split('/');
  if (resource && rest[0] === resource) rest.shift();
  return rest.length ? `${base}/${rest.join('/')}` : base;
}

/**
 * Coerce whatever the model emitted for status codes into a clean array of
 * distinct HTTP integers.
 *
 * `Array.isArray(e.statusCodes) ? e.statusCodes : []` was not enough: it checked
 * the container, never the contents. Real designs shipped codes with no
 * separator — `[201400409]` (one giant integer), `"201400409"` (a digit string),
 * `"200, 400, 401"` (a CSV string) — and the view rendered each *element* as one
 * badge, so `201400409` displayed as a single run-together number while a sibling
 * endpoint's `[200, 400, 409]` rendered correctly. It slipped through because
 * SOME endpoints in the same document were well-formed.
 *
 * The repair is deterministic because an HTTP status code is exactly three digits
 * in [100, 599]: a 9-digit run is unambiguously three codes. Each token is either
 * a valid 3-digit code, or a longer digit run that splits cleanly into 3-digit
 * codes (all in range), or — failing both — a single number kept only if it is a
 * valid code. Anything else is dropped rather than rendered as garbage. Runs at
 * the store's read boundary too, so it also repairs rows already persisted.
 */
export function normalizeStatusCodes(raw: unknown): number[] {
  const out: number[] = [];
  const push = (n: number): void => {
    if (Number.isInteger(n) && n >= 100 && n <= 599 && !out.includes(n)) out.push(n);
  };
  const fromDigits = (digits: string): void => {
    if (!digits) return;
    if (digits.length === 3) {
      push(Number(digits));
      return;
    }
    if (digits.length > 3 && digits.length % 3 === 0) {
      const chunks = digits.match(/.{3}/g) ?? [];
      const codes = chunks.map(Number);
      if (codes.every((n) => n >= 100 && n <= 599)) {
        codes.forEach(push);
        return;
      }
    }
    push(Number(digits)); // last resort — dropped by `push` if out of range
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      fromDigits(String(Math.trunc(Math.abs(value))));
    } else if (typeof value === 'string') {
      const tokens = value.split(/[^0-9]+/).filter(Boolean);
      if (tokens.length > 1) tokens.forEach(fromDigits);
      else fromDigits(tokens[0] ?? '');
    }
  };
  visit(raw);
  return out;
}

export function normalizeApiEndpoint(
  endpoint: ApiEndpoint,
  basePath: string,
): ApiEndpoint {
  const e = (endpoint ?? {}) as ApiEndpoint;
  const method =
    typeof e.method === 'string' && isHttpMethod(e.method.toUpperCase())
      ? (e.method.toUpperCase() as HttpMethod)
      : 'GET';
  return {
    ...e,
    method,
    path: absolutePath(e.path, basePath),
    summary: typeof e.summary === 'string' ? e.summary : '',
    requestSchema: Array.isArray(e.requestSchema) ? e.requestSchema : [],
    responseSchema: Array.isArray(e.responseSchema) ? e.responseSchema : [],
    statusCodes: normalizeStatusCodes(e.statusCodes),
  };
}

/**
 * Coerce a possibly-partial module to a complete shape.
 *
 * `coveredEntities` stays **undefined when absent**: a design written before
 * coverage accounting existed genuinely has no claim to make, and coercing it to
 * `[]` would turn "we don't know" into "this group covers nothing" — which reads
 * as a coverage failure on an artifact that may be perfectly fine.
 */
export function normalizeApiModule(module: ApiModule): ApiModule {
  const m = (module ?? {}) as ApiModule;
  const basePath = typeof m.basePath === 'string' ? m.basePath : '';
  const normalized: ApiModule = {
    name: typeof m.name === 'string' ? m.name : '',
    basePath,
    // Dedupe by method+path: two identical endpoints would publish the same
    // route twice in the OpenAPI/Postman export and list it twice in the view.
    endpoints: dedupeBy(
      Array.isArray(m.endpoints)
        ? m.endpoints.map((e) => normalizeApiEndpoint(e, basePath))
        : [],
      (e) => `${e.method} ${e.path}`,
    ),
  };
  if (Array.isArray(m.coveredEntities)) {
    normalized.coveredEntities = m.coveredEntities.filter(
      (e): e is string => typeof e === 'string' && e.trim().length > 0,
    );
  }
  if (typeof m.source === 'string' && isApiModuleSource(m.source)) {
    normalized.source = m.source;
  }
  return normalized;
}

export function isApiModuleSource(value: string): value is ApiModuleSource {
  return (API_MODULE_SOURCES as readonly string[]).includes(value);
}

/** Keep only well-shaped exclusions — an entity with an actual reason. */
export function normalizeExcludedEntities(
  excluded: ExcludedEntity[] | undefined,
): ExcludedEntity[] | undefined {
  if (!Array.isArray(excluded)) return undefined;
  return excluded
    .filter(
      (e) =>
        !!e &&
        typeof e.entity === 'string' &&
        e.entity.trim().length > 0 &&
        typeof e.reason === 'string' &&
        e.reason.trim().length > 0,
    )
    .map((e) => ({ entity: e.entity.trim(), reason: e.reason.trim() }));
}

/**
 * Coerce a whole API design to a complete shape. Applied at **both** boundaries
 * where an untrusted design enters the app — the agent's LLM output (write) and
 * the JSON store's read — because a design persisted before the write-side rule
 * existed can only be healed on the way out. One shared rule so the two can't drift.
 */
export function normalizeApiDesign(design: ApiDesign): ApiDesign {
  const excludedEntities = normalizeExcludedEntities(design?.excludedEntities);
  const normalized: ApiDesign = {
    ...design,
    // Dedupe by module name: a repeated module would render its whole endpoint
    // group twice — the same duplication class the System Design services hit.
    modules: dedupeBy(
      Array.isArray(design?.modules) ? design.modules.map(normalizeApiModule) : [],
      (m) => m.name,
    ),
  };
  if (excludedEntities) normalized.excludedEntities = excludedEntities;
  else delete normalized.excludedEntities;
  return normalized;
}
