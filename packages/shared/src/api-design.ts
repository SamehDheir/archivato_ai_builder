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
