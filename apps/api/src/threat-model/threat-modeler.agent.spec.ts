import {
  STRIDE_CATEGORIES,
  type ApiDesign,
  type DatabaseDesign,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';
import { ThreatModelerAgent } from '../llm/agents/threat-modeler.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { ThreatModelContext } from '../llm/agents/threat-modeler.agent';

const requirements: RequirementDocument = {
  sessionId: 's1',
  generatedAt: 'now',
  functional: [],
  nonFunctional: [],
  // A role with no permissions → should surface an elevation-of-privilege threat.
  roles: [{ name: 'member', description: 'a user', permissions: [] }],
  businessRules: [],
  constraints: [],
  assumptions: [],
};

const systemDesign: SystemDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  architecture: 'modular_monolith',
  architectureRationale: '',
  techStack: [
    { layer: 'backend', technology: 'NestJS', rationale: '' },
    { layer: 'database', technology: 'PostgreSQL', rationale: '' },
  ],
  services: [{ name: 'Auth', responsibility: 'authn', dependencies: [] }],
};

const databaseDesign: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'app users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'password_hash', type: 'string', nullable: false },
      ],
    },
  ],
  relations: [],
};

const apiDesign: ApiDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  modules: [
    {
      name: 'Auth',
      basePath: '/api/auth',
      endpoints: [
        {
          method: 'POST',
          path: '/api/auth/login',
          summary: 'Sign in',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [200],
        },
      ],
    },
    {
      name: 'Users',
      basePath: '/api/users',
      endpoints: [
        {
          method: 'GET',
          path: '/api/users/:id',
          summary: 'Get a user',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [200],
        },
      ],
    },
  ],
};

const ctx: ThreatModelContext = {
  idea: 'A SaaS with user accounts and billing',
  intent: null,
  requirements,
  systemDesign,
  databaseDesign,
  apiDesign,
};

describe('ThreatModelerAgent (deterministic fallback via mock provider)', () => {
  const agent = new ThreatModelerAgent(new MockLlmProvider());

  it('produces a complete STRIDE model covering every category', async () => {
    const model = await agent.generate('s1', ctx);

    expect(model.sessionId).toBe('s1');
    expect(model.threats.length).toBeGreaterThan(0);
    expect(model.summary).toMatch(/STRIDE/i);
    expect(model.trustBoundaries.length).toBeGreaterThan(0);
    expect(model.assumptions.length).toBeGreaterThan(0);

    // Every STRIDE category is represented.
    for (const { category } of STRIDE_CATEGORIES) {
      expect(model.threats.some((th) => th.category === category)).toBe(true);
    }

    // Each threat is well-formed.
    for (const th of model.threats) {
      expect(th.component).toBeTruthy();
      expect(th.threat).toBeTruthy();
      expect(th.mitigation).toBeTruthy();
      expect(['low', 'medium', 'high', 'critical']).toContain(th.severity);
    }
  });

  it('flags no-rate-limit auth (spoofing) and IDOR (elevation) from the design', async () => {
    const model = await agent.generate('s1', ctx);

    const spoofing = model.threats.filter((t) => t.category === 'spoofing');
    expect(spoofing.some((t) => /brute|credential|rate/i.test(t.threat))).toBe(
      true,
    );

    const eop = model.threats.filter(
      (t) => t.category === 'elevation_of_privilege',
    );
    // The /:id route → IDOR, and the permission-less role → broken access control.
    expect(eop.some((t) => /idor|id\b/i.test(t.threat + t.component))).toBe(true);
    expect(eop.some((t) => /member/i.test(t.component))).toBe(true);
  });

  it('sorts threats by severity (critical/high first)', async () => {
    const model = await agent.generate('s1', ctx);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < model.threats.length; i++) {
      expect(rank[model.threats[i].severity]).toBeGreaterThanOrEqual(
        rank[model.threats[i - 1].severity],
      );
    }
  });
});
