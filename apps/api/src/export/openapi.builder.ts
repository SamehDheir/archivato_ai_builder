import {
  exampleValue,
  type ApiDesign,
  type ApiEndpoint,
  type DatabaseDesign,
  type SchemaField,
} from '@archivato/shared';

/**
 * Builds an OpenAPI 3.0 document (as a plain JSON-serializable object) from the
 * API design, with component schemas derived from the database entities. Pure
 * and dependency-free.
 */
export function buildOpenApi(
  idea: string,
  apiDesign: ApiDesign,
  databaseDesign: DatabaseDesign,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const mod of apiDesign.modules) {
    for (const ep of mod.endpoints) {
      const path = toOpenApiPath(ep.path);
      paths[path] ??= {};
      paths[path][ep.method.toLowerCase()] = operation(mod.name, ep);
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Archivato Generated API',
      description: idea,
      version: '0.1.0',
    },
    paths,
    components: {
      schemas: componentSchemas(databaseDesign),
    },
  };
}

/** "/api/users/:id" → "/api/users/{id}" and collect path params. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParams(path: string) {
  const params = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  return params.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', example: exampleValue('string', name) },
  }));
}

function operation(tag: string, ep: ApiEndpoint): Record<string, unknown> {
  const op: Record<string, unknown> = {
    tags: [tag],
    summary: ep.summary,
    responses: responses(ep),
  };

  const params = pathParams(ep.path);
  // Query params come from the request schema on GET/DELETE.
  if (ep.method === 'GET' || ep.method === 'DELETE') {
    for (const f of ep.requestSchema) {
      params.push({
        name: f.name,
        in: 'query',
        required: f.required,
        schema: { type: jsonType(f.type), example: exampleValue(f.type, f.name) },
      } as never);
    }
  }
  if (params.length) op.parameters = params;

  if (
    (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') &&
    ep.requestSchema.length
  ) {
    op.requestBody = {
      required: true,
      content: {
        'application/json': { schema: objectSchema(ep.requestSchema) },
      },
    };
  }

  return op;
}

function responses(ep: ApiEndpoint): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const code of ep.statusCodes) {
    const isSuccess = code >= 200 && code < 300;
    out[String(code)] = {
      description: descriptionFor(code),
      ...(isSuccess && ep.responseSchema.length
        ? {
            content: {
              'application/json': { schema: objectSchema(ep.responseSchema) },
            },
          }
        : {}),
    };
  }
  return out;
}

function objectSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    // The `example` drives Swagger UI's "Example Value" + prefills the request
    // body on "Try it out".
    properties[f.name] = {
      type: jsonType(f.type),
      example: exampleValue(f.type, f.name),
    };
    if (f.required) required.push(f.name);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

function componentSchemas(
  db: DatabaseDesign,
): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const entity of db.entities) {
    schemas[entity.name] = objectSchema(
      entity.columns.map((c) => ({
        name: c.name,
        type: c.type,
        required: !c.nullable,
      })),
    );
  }
  return schemas;
}

function jsonType(type: string): string {
  switch (type) {
    case 'integer':
      return 'integer';
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'object';
    default:
      return 'string';
  }
}

function descriptionFor(code: number): string {
  const map: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    404: 'Not Found',
    409: 'Conflict',
  };
  return map[code] ?? 'Response';
}
