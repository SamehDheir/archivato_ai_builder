/**
 * Mock-response helpers for the API Docs "Try it out" feature. The generated
 * OpenAPI spec describes endpoints that have no real implementation, so the
 * backend mock server (and the spec's example values) synthesize believable
 * sample data **deterministically** from each endpoint's schema — pure,
 * runtime-free, and reusable on both server and client.
 */

import type { ApiDesign, ApiEndpoint, HttpMethod, SchemaField } from './api-design';

/** A deterministic example value for a field, keyed off its type then name. */
export function exampleValue(type: string, name = ''): unknown {
  const t = type.toLowerCase();
  const n = name.toLowerCase();

  if (t.includes('uuid') || n === 'id' || n.endsWith('id'))
    return '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  if (t.includes('bool')) return true;
  if (t.includes('int')) return 42;
  if (
    t.includes('decimal') ||
    t.includes('float') ||
    t.includes('double') ||
    t.includes('numeric') ||
    t.includes('number') ||
    t.includes('money')
  )
    return 19.99;
  if (t.includes('json') || t.includes('object') || t.includes('jsonb')) return {};
  if (
    t.includes('date') ||
    t.includes('time') ||
    t.includes('timestamp')
  )
    return '2026-01-01T00:00:00.000Z';

  // String-ish — refine by the field name.
  if (n.includes('email')) return 'user@example.com';
  if (n.includes('url') || n.includes('link')) return 'https://example.com';
  if (n.includes('phone')) return '+1-555-0100';
  if (n.includes('status')) return 'active';
  if (n.includes('name')) return 'Example Name';
  if (n.includes('description') || n.includes('summary')) return 'Lorem ipsum.';
  return 'string';
}

/** Build an example object from a flat list of schema fields. */
export function exampleObject(fields: SchemaField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = exampleValue(f.type, f.name);
  return out;
}

/** True if a design path segment is a parameter (`:id` or `{id}`). */
function isParamSegment(seg: string): boolean {
  return seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}'));
}

/** Split a path into non-empty segments (leading/trailing slashes ignored). */
function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Find the endpoint whose method + path template matches an incoming request
 * path. Parameter segments (`:id` / `{id}`) match any single value. Returns the
 * first match across all modules, or null.
 */
export function matchApiEndpoint(
  apiDesign: ApiDesign,
  method: string,
  requestPath: string,
): ApiEndpoint | null {
  const wantMethod = method.toUpperCase() as HttpMethod;
  const reqSegs = segments(requestPath.split('?')[0]);

  for (const mod of apiDesign.modules) {
    for (const ep of mod.endpoints) {
      if (ep.method !== wantMethod) continue;
      const epSegs = segments(ep.path);
      if (epSegs.length !== reqSegs.length) continue;
      const ok = epSegs.every(
        (seg, i) => isParamSegment(seg) || seg === reqSegs[i],
      );
      if (ok) return ep;
    }
  }
  return null;
}

export interface MockResponse {
  status: number;
  /** null when the endpoint has no body (e.g. 204 or an empty response schema). */
  body: Record<string, unknown> | null;
}

/** Lowest 2xx status code an endpoint declares (defaults to 200). */
function successStatus(codes: number[]): number {
  const twoxx = codes.filter((c) => c >= 200 && c < 300).sort((a, b) => a - b);
  return twoxx[0] ?? 200;
}

/** Synthesize the mock success response for an endpoint from its schema. */
export function mockResponse(endpoint: ApiEndpoint): MockResponse {
  const status = successStatus(endpoint.statusCodes);
  if (status === 204 || endpoint.responseSchema.length === 0) {
    return { status, body: null };
  }
  return { status, body: exampleObject(endpoint.responseSchema) };
}
