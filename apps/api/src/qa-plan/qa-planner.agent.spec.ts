import {
  TEST_TYPES,
  type ApiDesign,
  type DatabaseDesign,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';
import { QaPlannerAgent } from '../llm/agents/qa-planner.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { QaPlanContext } from '../llm/agents/qa-planner.agent';

const requirements: RequirementDocument = {
  sessionId: 's1',
  generatedAt: 'now',
  functional: [
    { id: 'FR-1', title: 'Create task', description: 'A user can create a task', priority: 'must' },
    { id: 'FR-2', title: 'Nice to have', description: 'A user can theme the UI', priority: 'could' },
  ],
  nonFunctional: [],
  roles: [
    { name: 'admin', description: '', permissions: ['*'] },
    { name: 'member', description: '', permissions: ['read'] },
  ],
  businessRules: [{ id: 'BR-1', description: 'A task must have an owner' }],
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
  services: [
    { name: 'Auth', responsibility: 'authn', dependencies: [] },
    { name: 'Tasks', responsibility: 'task mgmt', dependencies: ['Auth'] },
  ],
};

const databaseDesign: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'app users',
      columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
    },
    {
      name: 'tasks',
      description: 'tasks',
      columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
    },
  ],
  relations: [
    { from: 'users', to: 'tasks', type: 'one-to-many', description: 'owns' },
  ],
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
      name: 'Tasks',
      basePath: '/api/tasks',
      endpoints: [
        {
          method: 'GET',
          path: '/api/tasks',
          summary: 'List tasks',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [200],
        },
        {
          method: 'POST',
          path: '/api/tasks',
          summary: 'Create task',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [201],
        },
      ],
    },
  ],
};

const ctx: QaPlanContext = {
  idea: 'A task manager',
  intent: null,
  requirements,
  systemDesign,
  databaseDesign,
  apiDesign,
};

describe('QaPlannerAgent (deterministic fallback via mock provider)', () => {
  const agent = new QaPlannerAgent(new MockLlmProvider());

  it('produces a complete plan spanning every test type', async () => {
    const plan = await agent.generate('s1', ctx);

    expect(plan.sessionId).toBe('s1');
    expect(plan.suites.length).toBeGreaterThan(0);
    expect(plan.strategy.length).toBeGreaterThan(0);
    expect(plan.coverageGoals.length).toBeGreaterThan(0);
    expect(plan.tooling.length).toBeGreaterThan(0);
    expect(plan.outOfScope.length).toBeGreaterThan(0);

    // Every test type has a suite with at least one case.
    for (const { type } of TEST_TYPES) {
      const suites = plan.suites.filter((s) => s.type === type);
      expect(suites.length).toBeGreaterThan(0);
      expect(suites.some((s) => s.cases.length > 0)).toBe(true);
    }
  });

  it('assigns unique, sequential case ids and valid priorities', async () => {
    const plan = await agent.generate('s1', ctx);
    const ids = plan.suites.flatMap((s) => s.cases.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length); // unique
    expect(ids.every((id) => /^TC-\d+$/.test(id))).toBe(true);
    for (const s of plan.suites) {
      for (const c of s.cases) {
        expect(['high', 'medium', 'low']).toContain(c.priority);
        expect(c.expected).toBeTruthy();
      }
    }
  });

  it('derives cases from the design (endpoints, roles, acceptance)', async () => {
    const plan = await agent.generate('s1', ctx);
    const all = plan.suites.flatMap((s) => s.cases.map((c) => c.title)).join(' | ');
    // A create endpoint → an integration case.
    expect(all).toMatch(/POST \/api\/tasks/);
    // A permission-tiered role set → a privilege-escalation security case.
    expect(plan.suites.some((s) => s.type === 'security')).toBe(true);
    // A must-have functional requirement → a high-priority acceptance case.
    const acceptance = plan.suites.find((s) => s.type === 'acceptance');
    expect(acceptance?.cases.some((c) => /create a task/i.test(c.title))).toBe(true);
  });
});
