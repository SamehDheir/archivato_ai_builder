/**
 * The de-duplication safeguard behind the "sections render N times" bug.
 *
 * A generated artifact can carry the same list entry twice (an LLM listing a
 * service or a metric twice, a re-merged generation chunk); nothing upstream
 * removed them, and the views map their arrays verbatim, so a repeat in the data
 * was a repeat on the page — on every page. `dedupeBy` is the shared safeguard,
 * applied in the read-boundary normalizers (so a stored row heals on read) and
 * before rendering.
 */

import {
  dedupeBy,
  dedupeStrings,
  normalizeApiDesign,
  normalizeDatabaseDesign,
  normalizeQaPlan,
  normalizeThreatModel,
  type ApiDesign,
  type DatabaseDesign,
  type QaPlan,
  type ThreatModel,
} from '@archivato/shared';

describe('dedupeBy', () => {
  it('keeps the first occurrence and preserves order', () => {
    const items = [
      { name: 'Auth' },
      { name: 'Patient' },
      { name: 'Auth' },
      { name: 'Billing' },
    ];
    expect(dedupeBy(items, (i) => i.name).map((i) => i.name)).toEqual([
      'Auth',
      'Patient',
      'Billing',
    ]);
  });

  it('folds keys case- and whitespace-insensitively', () => {
    expect(dedupeStrings(['Redis', ' redis ', 'REDIS', 'Postgres'])).toEqual([
      'Redis',
      'Postgres',
    ]);
  });

  it('is a no-op on an already-unique list', () => {
    expect(dedupeStrings(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('read-boundary normalizers dedupe repeating sections', () => {
  it('collapses a database schema that repeats a table and its columns', () => {
    const design = {
      sessionId: 's1',
      generatedAt: 'now',
      databaseType: 'PostgreSQL',
      entities: [
        {
          name: 'users',
          description: '',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          ],
        },
        {
          name: 'users',
          description: '',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
        },
      ],
      relations: [
        { from: 'orders', to: 'users', type: 'one-to-many' },
        { from: 'orders', to: 'users', type: 'one-to-many' },
      ],
    } as unknown as DatabaseDesign;

    const out = normalizeDatabaseDesign(design);
    expect(out.entities).toHaveLength(1);
    expect(out.entities[0].columns).toHaveLength(1);
    expect(out.relations).toHaveLength(1);
  });

  it('collapses an API design that repeats a module and endpoint', () => {
    const mod = {
      name: 'Users',
      basePath: '/api/users',
      endpoints: [
        { method: 'GET', path: '/api/users', summary: '', requestSchema: [], responseSchema: [], statusCodes: [200] },
        { method: 'GET', path: '/api/users', summary: '', requestSchema: [], responseSchema: [], statusCodes: [200] },
      ],
    };
    const design = {
      sessionId: 's1',
      generatedAt: 'now',
      modules: [mod, { ...mod }],
    } as unknown as ApiDesign;

    const out = normalizeApiDesign(design);
    expect(out.modules).toHaveLength(1);
    expect(out.modules[0].endpoints).toHaveLength(1);
  });

  it('collapses a threat model that repeats a threat (it renders on the share page)', () => {
    const threat = {
      category: 'spoofing',
      component: 'Auth',
      threat: 'Credential stuffing',
      severity: 'high',
      mitigation: 'Rate limit',
    };
    const model = {
      sessionId: 's1',
      generatedAt: 'now',
      summary: '',
      threats: [threat, { ...threat }],
      trustBoundaries: ['Edge', 'Edge'],
      assumptions: [],
    } as unknown as ThreatModel;

    const out = normalizeThreatModel(model);
    expect(out.threats).toHaveLength(1);
    expect(out.trustBoundaries).toEqual(['Edge']);
  });

  it('collapses a QA plan that repeats a suite and a case', () => {
    const plan = {
      sessionId: 's1',
      generatedAt: 'now',
      summary: '',
      strategy: [],
      coverageGoals: [],
      tooling: ['Jest', 'Jest'],
      outOfScope: [],
      suites: [
        {
          name: 'Auth',
          testType: 'unit',
          objective: '',
          cases: [
            { id: 'TC-1', title: 'login', steps: [], expected: '' },
            { id: 'TC-1', title: 'login', steps: [], expected: '' },
          ],
        },
        { name: 'Auth', testType: 'unit', objective: '', cases: [] },
      ],
    } as unknown as QaPlan;

    const out = normalizeQaPlan(plan);
    expect(out.suites).toHaveLength(1);
    expect(out.suites[0].cases).toHaveLength(1);
    expect(out.tooling).toEqual(['Jest']);
  });
});
