/**
 * The API Design — output of the API Designer stage (spec Step 6).
 * Endpoints grouped by module, each with method, request/response schema, and
 * status codes. Derived from the Database Design + System Design services.
 */

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

export interface ApiDesign {
  sessionId: string;
  generatedAt: string;
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
    path: typeof e.path === 'string' && e.path.trim() ? e.path : basePath,
    summary: typeof e.summary === 'string' ? e.summary : '',
    requestSchema: Array.isArray(e.requestSchema) ? e.requestSchema : [],
    responseSchema: Array.isArray(e.responseSchema) ? e.responseSchema : [],
    statusCodes: Array.isArray(e.statusCodes) ? e.statusCodes : [],
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
    endpoints: Array.isArray(m.endpoints)
      ? m.endpoints.map((e) => normalizeApiEndpoint(e, basePath))
      : [],
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
    modules: Array.isArray(design?.modules)
      ? design.modules.map(normalizeApiModule)
      : [],
  };
  if (excludedEntities) normalized.excludedEntities = excludedEntities;
  else delete normalized.excludedEntities;
  return normalized;
}
