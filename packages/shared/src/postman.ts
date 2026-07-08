/**
 * Builds a Postman Collection (v2.1.0) from an API Design. Pure and
 * dependency-free. Endpoints are grouped into folders per module; each request
 * carries the method, a `{{baseUrl}}`-relative URL (with Postman `:param` path
 * variables and query params), and — for write methods — a JSON body prefilled
 * with schema-derived example values. Importable into Postman or Insomnia.
 */
import type { ApiDesign, ApiEndpoint, SchemaField } from './api-design';
import { exampleValue } from './mock-response';

const SCHEMA_URL =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

export function buildPostmanCollection(
  name: string,
  api: ApiDesign,
  baseUrl = 'http://localhost:3001',
): Record<string, unknown> {
  return {
    info: {
      name: `${truncate(name, 60)} — API`,
      description: name,
      schema: SCHEMA_URL,
    },
    variable: [{ key: 'baseUrl', value: baseUrl }],
    item: api.modules.map((mod) => ({
      name: mod.name,
      item: mod.endpoints.map((ep) => requestItem(ep)),
    })),
  };
}

function requestItem(ep: ApiEndpoint): Record<string, unknown> {
  const isWrite =
    ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH';
  const request: Record<string, unknown> = {
    method: ep.method,
    header: isWrite
      ? [{ key: 'Content-Type', value: 'application/json' }]
      : [],
    url: url(ep),
  };
  if (isWrite && ep.requestSchema.length) {
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(exampleBody(ep.requestSchema), null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  return {
    name: ep.summary || `${ep.method} ${ep.path}`,
    request,
  };
}

function url(ep: ApiEndpoint): Record<string, unknown> {
  const segments = ep.path.replace(/^\/+/, '').split('/').filter(Boolean);
  const pathVars = [...ep.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
    key: m[1],
    value: String(exampleValue('string', m[1])),
  }));
  const isQuery = ep.method === 'GET' || ep.method === 'DELETE';
  const query = isQuery
    ? ep.requestSchema.map((f) => ({
        key: f.name,
        value: String(exampleValue(f.type, f.name)),
        disabled: !f.required,
      }))
    : [];

  const raw =
    '{{baseUrl}}' +
    ep.path +
    (query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : '');

  return {
    raw,
    host: ['{{baseUrl}}'],
    path: segments,
    ...(query.length ? { query } : {}),
    ...(pathVars.length ? { variable: pathVars } : {}),
  };
}

function exampleBody(fields: SchemaField[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) body[f.name] = exampleValue(f.type, f.name);
  return body;
}

function truncate(s: string, max: number): string {
  const t = (s ?? '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t || 'Archivato';
}
