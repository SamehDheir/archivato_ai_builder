import {
  buildNarration,
  STREAM_STAGES,
  type ApiDesign,
  type DatabaseDesign,
  type RequirementDocument,
  type ReviewReport,
  type SystemDesign,
} from '@archivato/shared';

describe('buildNarration', () => {
  it('narrates a requirement document, ending with a done step', () => {
    const doc: RequirementDocument = {
      sessionId: 's1',
      generatedAt: 'now',
      functional: [
        { id: 'FR-1', title: 'Register', description: '', priority: 'must' },
        { id: 'FR-2', title: 'Login', description: '', priority: 'should' },
      ],
      nonFunctional: [
        { id: 'NFR-1', category: 'security', description: 'TLS' },
      ],
      roles: [{ name: 'Admin', description: 'runs it', permissions: [] }],
      businessRules: [{ id: 'BR-1', description: 'one per email' }],
      constraints: [],
      assumptions: [],
    };

    const steps = buildNarration('requirements', doc);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps[steps.length - 1].id).toBe('done');
    const all = steps.map((s) => `${s.label}\n${s.body ?? ''}`).join('\n');
    expect(all).toContain('FR-1');
    expect(all).toContain('Admin');
    expect(all).toContain('BR-1');
  });

  it('narrates services in the system design', () => {
    const design: SystemDesign = {
      sessionId: 's1',
      generatedAt: 'now',
      architecture: 'modular_monolith',
      architectureRationale: 'balanced',
      techStack: [{ layer: 'backend', technology: 'NestJS', rationale: '' }],
      services: [
        { name: 'Auth', responsibility: 'auth', dependencies: [] },
        { name: 'Billing', responsibility: 'money', dependencies: ['Auth'] },
      ],
    };

    const body = buildNarration('system-design', design)
      .map((s) => s.body ?? '')
      .join('\n');
    expect(body).toContain('NestJS');
    expect(body).toContain('Auth');
    expect(body).toContain('Billing');
  });

  it('narrates entities and relations in the database design', () => {
    const design: DatabaseDesign = {
      sessionId: 's1',
      generatedAt: 'now',
      databaseType: 'PostgreSQL',
      entities: [
        {
          name: 'users',
          description: '',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
        },
      ],
      relations: [
        { from: 'posts', to: 'users', type: 'one-to-many' },
      ],
    };

    const body = buildNarration('database-design', design)
      .map((s) => `${s.label}\n${s.body ?? ''}`)
      .join('\n');
    expect(body).toContain('users');
    expect(body).toContain('one-to-many');
  });

  it('narrates endpoints in the api design', () => {
    const design: ApiDesign = {
      sessionId: 's1',
      generatedAt: 'now',
      modules: [
        {
          name: 'Users',
          basePath: '/api/users',
          endpoints: [
            {
              method: 'GET',
              path: '/api/users/:id',
              summary: '',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    };

    const body = buildNarration('api-design', design)
      .map((s) => s.body ?? '')
      .join('\n');
    expect(body).toContain('GET');
    expect(body).toContain('/api/users/:id');
  });

  it('narrates scores and findings in the review', () => {
    const report = {
      sessionId: 's1',
      generatedAt: 'now',
      overallScore: 72,
      scores: { security: 60, scalability: 70, performance: 80, cost: 90 },
      scalabilityScore: 70,
      summary: '',
      securityIssues: [
        { title: 'No rate limit', detail: '', severity: 'high' as const },
      ],
      scalabilityIssues: [],
      performanceRisks: [],
      costOptimizations: [],
      missingFeatures: [],
      recommendations: ['Add caching'],
    } satisfies ReviewReport;

    const steps = buildNarration('review', report);
    const all = steps.map((s) => `${s.label}\n${s.body ?? ''}`).join('\n');
    expect(all).toContain('No rate limit');
    expect(all).toContain('Add caching');
    expect(steps[steps.length - 1].body).toContain('72');
  });

  it('is total: never throws and always returns steps, even on empty artifacts', () => {
    // Every stage, from the list itself — so a stage added to the union without
    // a narration case fails here rather than at runtime, mid-stream, in front
    // of the user it was added for.
    for (const stage of STREAM_STAGES) {
      const steps = buildNarration(stage, {} as never);
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it('narrates the standalone stages the stream newly covers', () => {
    const roadmap = {
      sessionId: 's1',
      generatedAt: 'now',
      summary: 'Three phases.',
      totalEstimate: '12-16 weeks',
      phases: [
        {
          name: 'MVP',
          goal: 'Ship the core.',
          milestones: [],
          dependsOn: [],
          isMvp: true,
          weeksMin: 6,
          weeksMax: 8,
        },
      ],
    } as never;

    const steps = buildNarration('roadmap', roadmap);
    const all = steps.map((s) => `${s.label}\n${s.body ?? ''}`).join('\n');

    expect(all).toContain('MVP');
    expect(all).toContain('12-16 weeks');
  });

  it('narrates a threat model by STRIDE category', () => {
    const model = {
      sessionId: 's1',
      generatedAt: 'now',
      summary: '',
      threats: [
        {
          category: 'spoofing',
          component: 'Auth',
          threat: 'Credential stuffing against the sign-in endpoint',
          severity: 'high',
          mitigation: 'Rate limit sign-in',
        },
      ],
      trustBoundaries: [],
      assumptions: [],
    } as never;

    const all = buildNarration('threat-model', model)
      .map((s) => `${s.label}\n${s.body ?? ''}`)
      .join('\n');

    expect(all).toContain('Credential stuffing');
  });
});
