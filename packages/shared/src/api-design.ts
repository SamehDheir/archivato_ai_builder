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

export interface ApiModule {
  /** e.g. Auth, Users, Billing. */
  name: string;
  /** e.g. "/api/users". */
  basePath: string;
  endpoints: ApiEndpoint[];
}

export interface ApiDesign {
  sessionId: string;
  generatedAt: string;
  modules: ApiModule[];
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

/** Coerce a possibly-partial module to a complete shape. */
export function normalizeApiModule(module: ApiModule): ApiModule {
  const m = (module ?? {}) as ApiModule;
  const basePath = typeof m.basePath === 'string' ? m.basePath : '';
  return {
    name: typeof m.name === 'string' ? m.name : '',
    basePath,
    endpoints: Array.isArray(m.endpoints)
      ? m.endpoints.map((e) => normalizeApiEndpoint(e, basePath))
      : [],
  };
}

/**
 * Coerce a whole API design to a complete shape. Applied at **both** boundaries
 * where an untrusted design enters the app — the agent's LLM output (write) and
 * the JSON store's read — because a design persisted before the write-side rule
 * existed can only be healed on the way out. One shared rule so the two can't drift.
 */
export function normalizeApiDesign(design: ApiDesign): ApiDesign {
  return {
    ...design,
    modules: Array.isArray(design?.modules)
      ? design.modules.map(normalizeApiModule)
      : [],
  };
}
