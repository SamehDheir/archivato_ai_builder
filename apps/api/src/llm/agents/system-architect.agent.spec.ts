import type { RequirementDocument, SlotMap, SystemDesign } from '@archivato/shared';
import { SystemArchitectAgent } from './system-architect.agent';
import type { SystemDesignContext } from './system-architect.agent';
import { MockLlmProvider } from '../mock-llm.provider';

function reqDoc(overrides: Partial<RequirementDocument> = {}): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-15T00:00:00.000Z',
    functional: [
      { id: 'FR-1', title: 'Book a slot', description: 'Customers can book a service slot and pay online.', priority: 'must' },
      { id: 'FR-2', title: 'Send reminders', description: 'The system emails booking reminders.', priority: 'should' },
    ],
    nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'TLS everywhere.' }],
    roles: [{ name: 'Customer', description: 'Books services.', permissions: ['booking:create'] }],
    businessRules: [{ id: 'BR-1', description: 'One booking per slot.' }],
    constraints: ['Must use PostgreSQL.'],
    assumptions: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<SystemDesignContext> = {}): SystemDesignContext {
  return {
    idea: 'A home-services booking app with online payment and email reminders',
    intent: null,
    requirements: reqDoc(),
    ...overrides,
  };
}

/** A slot value shorthand. */
function slot(value: string): SlotMap[keyof SlotMap] {
  return { value, confidence: 'high', source: 'explicit' };
}

describe('SystemArchitectAgent (R8)', () => {
  describe('deterministic fallback', () => {
    it('assigns a complexity + rationale to every module', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const design = await agent.generate('s1', ctx());

      expect(design.services.length).toBeGreaterThan(0);
      for (const svc of design.services) {
        expect(['S', 'M', 'L', 'XL']).toContain(svc.complexity);
        expect(svc.complexityRationale).toBeTruthy();
      }
    });

    it('emits build-vs-buy for the capabilities the requirements imply', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const design = await agent.generate('s1', ctx());

      const caps = (design.buildVsBuy ?? []).map((b) => b.capability);
      expect(caps).toContain('auth');
      expect(caps).toContain('payments');
      expect(caps).toContain('notifications');
      const payments = design.buildVsBuy!.find((b) => b.capability === 'payments');
      expect(payments!.recommendation).toBe('buy');
      expect(payments!.suggestedService).toBeTruthy();
    });

    it('passes stated constraints through to constraintCompliance', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const design = await agent.generate('s1', ctx());

      const constraints = (design.constraintCompliance ?? []).map((c) => c.constraint);
      expect(constraints).toContain('Must use PostgreSQL.');
      for (const c of design.constraintCompliance ?? []) {
        expect(c.howAddressed).toBeTruthy();
      }
    });

    it('omits phasedArchitecture when there is no scale/budget conflict', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      // Plain requirements, no slots → no conflict signal.
      const design = await agent.generate(
        's1',
        ctx({ requirements: reqDoc({ nonFunctional: [] }) }),
      );

      expect(design.phasedArchitecture).toBeUndefined();
    });

    it('emits phasedArchitecture when large scale conflicts with a tight timeline', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const slots: SlotMap = {
        scale_expectations: slot('100,000 users nationwide in year one'),
        timeline: slot('2 months, tight deadline'),
        budget_range: slot('limited, bootstrap budget'),
      };
      const design = await agent.generate('s1', ctx({ slots }));

      expect(design.phasedArchitecture).toBeDefined();
      expect(design.phasedArchitecture!.mvp).toBeTruthy();
      expect(design.phasedArchitecture!.growthPath).toBeTruthy();
      expect(design.phasedArchitecture!.migrationNotes).toBeTruthy();
      // Under tight constraints the fallback stays on the simplest architecture.
      expect(design.architecture).toBe('modular_monolith');
    });

    it('detects a purely-numeric large scale figure', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const slots: SlotMap = {
        scale_expectations: slot('1,000,000 users'),
        timeline: slot('2 months, tight deadline'),
      };
      const design = await agent.generate('s1', ctx({ slots }));
      expect(design.phasedArchitecture).toBeDefined();
    });

    it('does not read a relaxed timeline/budget as a tight constraint', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const slots: SlotMap = {
        scale_expectations: slot('100,000 users nationwide'),
        timeline: slot('flexible, no rush'),
        budget_range: slot('generous, plenty of runway'),
      };
      const design = await agent.generate('s1', ctx({ slots }));
      expect(design.phasedArchitecture).toBeUndefined();
    });

    it('splits a period-separated constraints slot into separate compliance rows', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const slots: SlotMap = {
        constraints: slot('Must use PostgreSQL. Must host in the EU. Must be GDPR-compliant.'),
      };
      const design = await agent.generate('s1', ctx({ slots }));
      const constraints = (design.constraintCompliance ?? []).map((c) => c.constraint);
      expect(constraints).toEqual(
        expect.arrayContaining([
          'Must use PostgreSQL',
          'Must host in the EU',
          'Must be GDPR-compliant',
        ]),
      );
    });

    it('preserves the traceable, downstream-consumed core fields', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const design = await agent.generate('s1', ctx());

      // Fields the API-design + cost stages read must be untouched by R8.
      expect(['monolith', 'modular_monolith', 'microservices']).toContain(
        design.architecture,
      );
      expect(design.techStack.length).toBeGreaterThan(0);
      expect(design.services.every((s) => typeof s.name === 'string')).toBe(true);
    });
  });

  describe('LLM path normalization', () => {
    it('backfills complexity on modules the model left out and drops unknown build-vs-buy capabilities', async () => {
      const mock = new MockLlmProvider();
      const llm: Partial<SystemDesign> = {
        architecture: 'modular_monolith',
        architectureRationale: 'Simplest that fits.',
        techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'DI.' }],
        services: [
          // no complexity → must be backfilled
          { name: 'Auth', responsibility: 'Auth and tokens.', dependencies: [] },
          {
            name: 'Payments',
            responsibility: 'Charges and payouts.',
            dependencies: ['Auth'],
            complexity: 'L',
            complexityRationale: 'money movement',
          },
        ],
        buildVsBuy: [
          { capability: 'payments', recommendation: 'buy', suggestedService: 'Stripe', rationale: 'PCI.', impact: 'fees' },
          // unknown capability — must be filtered out
          { capability: 'blockchain' as never, recommendation: 'build', rationale: 'x', impact: 'y' },
        ],
      };
      mock.enqueueJson(llm);
      const agent = new SystemArchitectAgent(mock);

      const design = await agent.generate('s1', ctx());

      for (const svc of design.services) {
        expect(['S', 'M', 'L', 'XL']).toContain(svc.complexity);
      }
      const caps = (design.buildVsBuy ?? []).map((b) => b.capability);
      expect(caps).toContain('payments');
      expect(caps).not.toContain('blockchain');
    });

    it('drops a model-supplied phasedArchitecture when the inputs show no conflict', async () => {
      const mock = new MockLlmProvider();
      const llm: Partial<SystemDesign> = {
        architecture: 'modular_monolith',
        architectureRationale: 'Simplest that fits.',
        techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'DI.' }],
        services: [{ name: 'Auth', responsibility: 'Auth.', dependencies: [] }],
        phasedArchitecture: {
          mvp: 'invented',
          growthPath: 'invented',
          migrationNotes: 'invented',
        },
      };
      mock.enqueueJson(llm);
      const agent = new SystemArchitectAgent(mock);

      // No conflict slots → phased is gated off regardless of model output.
      const design = await agent.generate('s1', ctx());
      expect(design.phasedArchitecture).toBeUndefined();
    });
  });
});
