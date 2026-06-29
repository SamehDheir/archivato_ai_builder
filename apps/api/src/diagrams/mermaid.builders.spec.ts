import type {
  ApiDesign,
  DatabaseDesign,
  SystemDesign,
} from '@archivato/shared';
import {
  buildAllDiagrams,
  buildClassDiagram,
  buildDeployment,
  buildErd,
  buildFlowchart,
  buildMicroservices,
  buildSequence,
} from './mermaid.builders';

const db: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'app users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, unique: true },
      ],
    },
    {
      name: 'invoices',
      description: 'billing',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'user_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'users', column: 'id' },
        },
      ],
    },
  ],
  relations: [
    { from: 'users', to: 'invoices', type: 'one-to-many', description: 'has' },
  ],
};

const sys: SystemDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  architecture: 'microservices',
  architectureRationale: 'scale',
  techStack: [
    { layer: 'frontend', technology: 'Next.js', rationale: '' },
    { layer: 'backend', technology: 'NestJS', rationale: '' },
    { layer: 'database', technology: 'PostgreSQL', rationale: '' },
    { layer: 'cache', technology: 'Redis', rationale: '' },
  ],
  services: [
    { name: 'Auth', responsibility: 'authn', dependencies: [] },
    { name: 'Billing', responsibility: 'invoices', dependencies: ['Auth'] },
  ],
};

const api: ApiDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  modules: [
    {
      name: 'Billing',
      basePath: '/api/billing',
      endpoints: [
        {
          method: 'POST',
          path: '/api/billing',
          summary: 'create invoice',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [201],
        },
      ],
    },
  ],
};

describe('mermaid builders', () => {
  it('ERD has entities, a PK/FK, and a relation with cardinality', () => {
    const m = buildErd(db);
    expect(m.startsWith('erDiagram')).toBe(true);
    expect(m).toContain('USERS {');
    expect(m).toContain('uuid id PK');
    expect(m).toContain('uuid user_id FK');
    expect(m).toContain('USERS ||--o{ INVOICES');
  });

  it('class diagram emits classes + attributes', () => {
    const m = buildClassDiagram(db);
    expect(m.startsWith('classDiagram')).toBe(true);
    expect(m).toContain('class users {');
    expect(m).toContain('+uuid id');
  });

  it('microservices graph wires dependencies', () => {
    const m = buildMicroservices(sys);
    expect(m.startsWith('flowchart LR')).toBe(true);
    expect(m).toContain('Billing --> Auth');
  });

  it('deployment reflects microservices + tech + cache', () => {
    const m = buildDeployment(sys);
    expect(m.startsWith('flowchart TB')).toBe(true);
    expect(m).toContain('Gateway');
    expect(m).toContain('Redis');
    expect(m).toContain('PostgreSQL');
  });

  it('sequence picks a write endpoint', () => {
    const m = buildSequence(api, sys);
    expect(m.startsWith('sequenceDiagram')).toBe(true);
    expect(m).toContain('POST /api/billing');
    expect(m).toContain('201 response');
  });

  it('flowchart renders a request lifecycle', () => {
    const m = buildFlowchart(sys);
    expect(m.startsWith('flowchart TD')).toBe(true);
    expect(m).toContain('Authenticated?');
  });

  it('buildAll notes missing prerequisites', () => {
    const diagrams = buildAllDiagrams({
      systemDesign: null,
      databaseDesign: null,
      apiDesign: null,
    });
    expect(diagrams).toHaveLength(6);
    expect(diagrams.every((d) => d.mermaid === '' && d.note)).toBe(true);
    // With a system design, the flowchart builds.
    const some = buildAllDiagrams({
      systemDesign: sys,
      databaseDesign: null,
      apiDesign: null,
    });
    expect(some.find((d) => d.kind === 'flowchart')?.mermaid).toContain(
      'flowchart',
    );
    expect(some.find((d) => d.kind === 'erd')?.note).toBeTruthy();
  });
});
