import {
  coverageSourcesFromDesign,
  findUncoveredRequirements,
  type FunctionalRequirement,
  type RequirementDocument,
  type ServiceModule,
} from '@archivato/shared';
import { SystemArchitectAgent } from './system-architect.agent';
import type { SystemDesignContext } from './system-architect.agent';
import { MockLlmProvider } from '../mock-llm.provider';
import type { LlmMessage } from '../llm-provider.interface';

/**
 * The "Requirements with no owning service" coverage check produced false
 * positives: it compared EXACT tokens, so "Simple payment processing" shared no
 * word with "Processes payments…", "Role-based access control" shared none with
 * "…RBAC enforcement for all roles", and a concern met by the tech stack (data
 * encryption via Aurora/TLS) was never even considered. These pin the fix — light
 * stemming + non-service coverage sources in the deterministic pass, then an LLM
 * verification pass for genuine synonymy — while proving a REAL gap still flags.
 */

const fr = (
  id: string,
  title: string,
  description: string,
): FunctionalRequirement => ({ id, title, description, priority: 'must' });

const svc = (name: string, responsibility: string): ServiceModule => ({
  name,
  responsibility,
  dependencies: [],
  complexity: 'M',
  complexityRationale: 'x',
});

// ── the deterministic pass: stemming + non-service coverage ───────────────────

describe('findUncoveredRequirements — morphology and non-service coverage', () => {
  it('FR-5: "Simple payment processing" is covered by "Processes payments…"', () => {
    // The exact reported false positive — plural/verb morphology, zero shared
    // exact tokens, obviously the same capability.
    expect(
      findUncoveredRequirements(
        [fr('FR-5', 'Simple payment processing', 'Process customer payments online')],
        [
          svc(
            'BillingService',
            'Processes payments, handles multi-currency, and submits insurance claims',
          ),
        ],
      ),
    ).toEqual([]);
  });

  it('FR-4: "Role-based access control" is covered by "…RBAC enforcement for all roles"', () => {
    expect(
      findUncoveredRequirements(
        [fr('FR-4', 'Role-based access control', 'Restrict actions by user role')],
        [
          svc(
            'AuthService',
            'Handles user authentication, MFA, and RBAC enforcement for all roles',
          ),
        ],
      ),
    ).toEqual([]);
  });

  it('FR-7: "Data encryption" is covered by a tech-stack choice, not a service', () => {
    const services = [svc('AuthService', 'Authentication and sessions')];
    const extra = coverageSourcesFromDesign({
      techStack: [
        {
          layer: 'database',
          technology: 'Aurora PostgreSQL',
          rationale: 'Encryption at rest via KMS; TLS 1.3 in transit',
        },
      ],
    });
    expect(
      findUncoveredRequirements(
        [fr('FR-7', 'Data encryption', 'All data encrypted at rest and in transit')],
        services,
        extra,
      ),
    ).toEqual([]);
    // …and without the tech-stack source it would (correctly) be a candidate,
    // proving the widening is what recognises the coverage.
    expect(
      findUncoveredRequirements(
        [fr('FR-7', 'Data encryption', 'All data encrypted at rest and in transit')],
        services,
      ),
    ).toEqual(['FR-7']);
  });

  it('still flags a genuinely uncovered requirement (recall preserved)', () => {
    expect(
      findUncoveredRequirements(
        [
          fr('FR-5', 'Payment processing', 'Process payments'),
          fr('FR-9', 'Loyalty rewards program', 'Customers earn points on purchases'),
        ],
        [svc('BillingService', 'Processes payments and refunds')],
        coverageSourcesFromDesign({
          techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'typed' }],
        }),
      ),
    ).toEqual(['FR-9']);
  });

  it('does not over-stem into false coverage (no shared real word)', () => {
    // "Reporting" must not be treated as covered by "Reservations" or similar.
    expect(
      findUncoveredRequirements(
        [fr('FR-3', 'Analytics reporting', 'Generate sales reports')],
        [svc('BookingService', 'Reservations and scheduling')],
      ),
    ).toEqual(['FR-3']);
  });
});

// ── the LLM verification pass, through the agent ─────────────────────────────

const lastUser = (messages: LlmMessage[]): string =>
  [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

const COVERAGE_MARKER = 'auditing a system design for requirement coverage';

function requirements(): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    functional: [
      // Synonym-only coverage: no shared stem with "IdentityService authenticates".
      fr('FR-1', 'Secure member sign-in', 'Members can sign in securely'),
      // A genuine gap: nothing provides loyalty anywhere.
      fr('FR-2', 'Loyalty rewards', 'Customers accrue loyalty rewards'),
      // Plainly covered by a service token — never a candidate.
      fr('FR-3', 'Browse products', 'Customers browse the product catalog'),
    ],
    nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'Access is authenticated' }],
    roles: [
      { name: 'Member', description: 'Shops', permissions: ['browse'] },
      { name: 'Admin', description: 'Runs the store', permissions: ['manage'] },
    ],
    businessRules: [],
    constraints: [],
    assumptions: [],
  };
}

const DESIGN = {
  architecture: 'modular_monolith',
  architectureRationale: 'Simple to operate.',
  techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'Typed and fast.' }],
  services: [
    // 'identity' satisfies the auth-service check, so none is auto-added.
    { name: 'IdentityService', responsibility: 'Authenticates users and issues session tokens', dependencies: [], complexity: 'M', complexityRationale: 'x' },
    { name: 'CatalogService', responsibility: 'Lists and searches products', dependencies: [], complexity: 'M', complexityRationale: 'x' },
  ],
  buildVsBuy: [
    { capability: 'payments', recommendation: 'buy', suggestedService: 'Stripe', rationale: 'Faster to integrate.', impact: 'cost' },
  ],
  constraintCompliance: [],
};

const ctx: SystemDesignContext = {
  idea: 'An online store',
  intent: null,
  requirements: requirements(),
};

describe('coverage verification pass (agent)', () => {
  it('clears a synonym false positive but keeps the real gap', async () => {
    const coveragePrompts: string[] = [];
    const llm = new MockLlmProvider((messages) => {
      const prompt = lastUser(messages);
      if (prompt.includes(COVERAGE_MARKER)) {
        coveragePrompts.push(prompt);
        return JSON.stringify({
          coverage: [
            { id: 'FR-1', covered: true, where: 'IdentityService authenticates users' },
            { id: 'FR-2', covered: false, where: 'no service or technology provides loyalty' },
          ],
        });
      }
      return JSON.stringify(DESIGN);
    });

    const design = await new SystemArchitectAgent(llm).generate('s1', ctx);

    // FR-1 (sign-in ≈ authentication) cleared by the LLM; FR-2 (loyalty) kept.
    expect(design.uncoveredRequirements).toEqual(['FR-2']);
    // The verification ran, and only on the deterministic candidates (not FR-3).
    expect(coveragePrompts).toHaveLength(1);
    expect(coveragePrompts[0]).toContain('FR-1');
    expect(coveragePrompts[0]).toContain('FR-2');
    expect(coveragePrompts[0]).not.toContain('FR-3');
  });

  it('keeps every candidate when the verification reply is unusable (recall)', async () => {
    const llm = new MockLlmProvider((messages) => {
      const prompt = lastUser(messages);
      if (prompt.includes(COVERAGE_MARKER)) return '{"nonsense":true}';
      return JSON.stringify(DESIGN);
    });

    const design = await new SystemArchitectAgent(llm).generate('s1', ctx);

    // Neither is cleared — an unreadable verdict must never drop a real gap.
    expect(design.uncoveredRequirements?.sort()).toEqual(['FR-1', 'FR-2']);
  });

  it('makes no verification call when nothing is flagged', async () => {
    const covered = requirements();
    covered.functional = [fr('FR-3', 'Browse products', 'Browse the product catalog')];
    let coverageCalls = 0;
    const llm = new MockLlmProvider((messages) => {
      if (lastUser(messages).includes(COVERAGE_MARKER)) coverageCalls += 1;
      return JSON.stringify(DESIGN);
    });

    const design = await new SystemArchitectAgent(llm).generate('s1', {
      ...ctx,
      requirements: covered,
    });

    expect(design.uncoveredRequirements).toBeUndefined();
    expect(coverageCalls).toBe(0);
  });
});
