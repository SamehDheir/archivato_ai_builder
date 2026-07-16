import {
  normalizeApiDesign,
  type ApiDesign,
  type DatabaseDesign,
} from '@archivato/shared';
import { buildOpenApi } from '../export/openapi.builder';

/**
 * A row as it can genuinely sit in the JSON store: written before the agent
 * normalized its LLM output, so required arrays are simply absent. The type says
 * they're there; the database disagrees, and the cast on the way out believes the
 * type. Built through `as unknown as` because a literal could not express it.
 */
const legacyRow = {
  sessionId: 's1',
  generatedAt: new Date().toISOString(),
  modules: [
    {
      name: 'Orders',
      basePath: '/api/orders',
      endpoints: [
        // No statusCodes, no requestSchema, no responseSchema, no summary.
        { method: 'GET', path: '/api/orders' },
        // Not even a method or a path.
        {},
      ],
    },
    // A module whose endpoints array is missing entirely.
    { name: 'Broken', basePath: '/api/broken' },
  ],
} as unknown as ApiDesign;

const databaseDesign = {
  sessionId: 's1',
  generatedAt: new Date().toISOString(),
  databaseType: 'PostgreSQL',
  entities: [],
  relations: [],
} as unknown as DatabaseDesign;

describe('normalizeApiDesign (JSON-store read boundary)', () => {
  it('coerces missing required arrays on a legacy row to empty, never undefined', () => {
    const design = normalizeApiDesign(legacyRow);
    const ep = design.modules[0].endpoints[0];

    expect(Array.isArray(ep.statusCodes)).toBe(true);
    expect(Array.isArray(ep.requestSchema)).toBe(true);
    expect(Array.isArray(ep.responseSchema)).toBe(true);
    expect(ep.summary).toBe('');
  });

  it('fills a method and path for an endpoint that has neither', () => {
    const ep = normalizeApiDesign(legacyRow).modules[0].endpoints[1];
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/api/orders'); // falls back to the module base path
  });

  it('survives a module with no endpoints array', () => {
    const design = normalizeApiDesign(legacyRow);
    expect(design.modules[1].endpoints).toEqual([]);
  });

  it('leaves a well-formed design untouched', () => {
    const good: ApiDesign = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      modules: [
        {
          name: 'Orders',
          basePath: '/api/orders',
          endpoints: [
            {
              method: 'POST',
              path: '/api/orders',
              summary: 'Create',
              requestSchema: [{ name: 'total', type: 'decimal', required: true }],
              responseSchema: [{ name: 'id', type: 'uuid', required: true }],
              statusCodes: [201, 400],
            },
          ],
        },
      ],
    };
    expect(normalizeApiDesign(good)).toEqual(good);
  });

  // The bug this exists for: a legacy row took down the OpenAPI export with
  // "ep.statusCodes is not iterable". Normalizing on read is what unbreaks every
  // consumer at once, so assert the real builder now survives the real shape.
  it('lets the OpenAPI export build from a legacy row instead of throwing', () => {
    expect(() => buildOpenApi('An idea', legacyRow, databaseDesign)).toThrow();

    expect(() =>
      buildOpenApi('An idea', normalizeApiDesign(legacyRow), databaseDesign),
    ).not.toThrow();
  });
});
