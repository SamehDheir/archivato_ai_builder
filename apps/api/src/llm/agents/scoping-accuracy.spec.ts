import {
  askedQuestionCount,
  enforcePaymentAvailability,
  findUncoveredRequirements,
  missingAuthService,
  paymentAvailabilityFor,
  regulationsForMarket,
  resolveRegion,
  resolveRegionKey,
  type BuildVsBuyItem,
  type InterviewExchange,
  type RequirementDocument,
  type ServiceModule,
  type SystemDesign,
} from '@archivato/shared';
import { SystemArchitectAgent } from './system-architect.agent';
import type { SystemDesignContext } from './system-architect.agent';
import { MockLlmProvider } from '../mock-llm.provider';
import type { LlmProvider } from '../llm-provider.interface';
import { InterviewPhase } from '@archivato/shared';

/**
 * Regressions from a real end-to-end run ("Nour Boutique" — a women's fashion
 * store in Gaza/West Bank). Every case here shipped a wrong artifact to a real
 * scoping document, not a hypothetical one.
 */

// ── the market that classified as "unknown" ──────────────────────────────────

describe('region classification', () => {
  it('recognises Palestine, which silently disabled three stages', () => {
    // With this returning null the requirement document asked the client to
    // confirm the market they had *just stated*, the cost estimate carried no
    // regional payment-fee note, and the architect got no residency line.
    for (const market of [
      'Gaza/West Bank, Palestine',
      'Palestine',
      'Gaza',
      'West Bank',
      'فلسطين',
      'غزة',
    ]) {
      expect(resolveRegionKey(market)).toBe('mena');
    }
  });

  it('recognises the other Arab markets that were missing', () => {
    for (const market of ['Syria', 'Sudan', 'Mauritania', 'Djibouti', 'Somalia', 'سوريا']) {
      expect(resolveRegionKey(market)).toBe('mena');
    }
  });

  it('turns the compliance and pricing lookups back on for those markets', () => {
    expect(regulationsForMarket('Gaza/West Bank, Palestine')).not.toBeNull();
    expect(resolveRegion('Palestine')).not.toBeNull();
  });

  it('still returns null for a market it genuinely cannot place', () => {
    expect(resolveRegionKey('somewhere unspecified')).toBeNull();
    expect(resolveRegionKey('')).toBeNull();
  });
});

// ── the payment provider the client cannot use ───────────────────────────────

describe('payment availability', () => {
  const paymentsItem = (over: Partial<BuildVsBuyItem> = {}): BuildVsBuyItem => ({
    capability: 'payments',
    recommendation: 'buy',
    suggestedService: 'Stripe',
    rationale:
      'Buying a payment service like Stripe is more cost-effective and faster to implement than building a custom payment solution.',
    impact: 'time/cost',
    ...over,
  });

  it('replaces a processor that does not onboard merchants in the market', () => {
    const { items, corrected } = enforcePaymentAvailability(
      [paymentsItem()],
      'Gaza/West Bank, Palestine',
    );

    expect(corrected).toBe(true);
    // Stripe is no longer RECOMMENDED …
    expect(items[0].suggestedService).not.toMatch(/stripe/i);
    expect(items[0].rationale).not.toMatch(/(?:like|such as) Stripe/i);
    // … but it is still NAMED, as the thing the client cannot use. Removing the
    // word entirely would leave the owner to rediscover the problem themselves.
    expect(items[0].rationale).toMatch(/Stripe and PayPal do not onboard merchants/i);
    // And the argument the sentence was making survives the substitution.
    expect(items[0].rationale).toMatch(/cost-effective/);
    // The replacement reads as a recommendation, not a menu.
    expect(items[0].suggestedService!.split(' or ')).toHaveLength(3);
  });

  it('is country-level: Stripe stays for a market that can actually use it', () => {
    // The whole reason the table is not keyed by RegionKey — Stripe onboards in
    // the UAE, so a `mena`-keyed rule would be wrong in both directions.
    const { items, corrected } = enforcePaymentAvailability([paymentsItem()], 'UAE, Dubai');

    expect(corrected).toBe(false);
    expect(items[0].suggestedService).toBe('Stripe');
  });

  it('claims nothing for an unknown market', () => {
    expect(paymentAvailabilityFor('somewhere unspecified')).toBeNull();
    expect(enforcePaymentAvailability([paymentsItem()], undefined).corrected).toBe(false);
  });

  it('leaves non-payment and build recommendations alone', () => {
    const items: BuildVsBuyItem[] = [
      { capability: 'auth', recommendation: 'build', rationale: 'Use Stripe-like libs.', impact: 'x' },
      paymentsItem({ recommendation: 'build', suggestedService: undefined }),
    ];
    expect(enforcePaymentAvailability(items, 'Palestine').corrected).toBe(false);
  });
});

// ── the design that had no way to authenticate anyone ────────────────────────

describe('auth service', () => {
  const role = (name: string) => ({ name, description: `${name}.`, permissions: ['read'] });
  const svc = (name: string, responsibility: string): ServiceModule => ({
    name,
    responsibility,
    dependencies: [],
    complexity: 'M',
    complexityRationale: 'x',
  });

  it('is required when the requirements define two or more roles', () => {
    const missing = missingAuthService(
      [svc('Order Service', 'Manages orders'), svc('Inventory Service', 'Tracks stock')],
      [role('Admin'), role('Packing/Shipping')],
    );

    expect(missing).not.toBeNull();
    expect(missing!.name).toMatch(/auth/i);
    expect(missing!.responsibility).toContain('Admin');
  });

  it('is not added when the design already owns identity', () => {
    for (const existing of ['Auth Service', 'Identity Service', 'Users Service', 'Accounts']) {
      expect(
        missingAuthService([svc(existing, 'Handles sign-in')], [role('A'), role('B')]),
      ).toBeNull();
    }
  });

  it('is not forced on a single-role project', () => {
    expect(missingAuthService([svc('Order Service', 'Orders')], [role('Owner')])).toBeNull();
    expect(missingAuthService([svc('Order Service', 'Orders')], [])).toBeNull();
  });
});

// ── the requirement that appeared in no service at all ───────────────────────

describe('requirement coverage', () => {
  const fr = (id: string, title: string, description: string) => ({
    id,
    title,
    description,
    priority: 'must' as const,
  });
  const svc = (name: string, responsibility: string): ServiceModule => ({
    name,
    responsibility,
    dependencies: [],
    complexity: 'M',
    complexityRationale: 'x',
  });

  it('reports a requirement no service implements', () => {
    const gaps = findUncoveredRequirements(
      [
        fr('FR-1', 'Order Placement', 'Customers place orders'),
        fr('FR-8', 'Coupon/Discount System', 'The owner can create coupons and discounts'),
      ],
      [svc('Order Service', 'Manages order placement and confirmation')],
    );

    expect(gaps).toEqual(['FR-8']);
  });

  it('accepts a service that matches on one distinctive word', () => {
    // Generous on purpose — the opposite calibration to the review's
    // scope-integrity check, because here a false positive claims a requirement
    // is unbuilt when it is only worded differently.
    const gaps = findUncoveredRequirements(
      [fr('FR-8', 'Coupon/Discount System', 'Create coupons')],
      [svc('Promotions Service', 'Issues and validates coupons')],
    );

    expect(gaps).toEqual([]);
  });

  it('does not report a requirement with no distinctive words of its own', () => {
    // Only stop-words and short words survive tokenization, so there is nothing
    // to match on — an unprovable gap is not reported as a gap.
    const gaps = findUncoveredRequirements(
      [fr('FR-9', 'Data', 'The system data for the user')],
      [svc('Order Service', 'Orders')],
    );

    expect(gaps).toEqual([]);
  });

  it('reports nothing when every requirement is covered', () => {
    expect(
      findUncoveredRequirements(
        [fr('FR-1', 'Inventory Updates', 'Stock levels update automatically')],
        [svc('Inventory Service', 'Manages inventory updates and low-stock alerts')],
      ),
    ).toEqual([]);
  });
});

// ── the three guarantees, end to end through the agent ───────────────────────

/** A model that returns the exact design shape the real run produced. */
class NourBoutiqueLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly defaultModel = 'mock-1';
  readonly prompts: string[] = [];

  async complete(): Promise<string> {
    return '';
  }

  async completeJson<T>(messages: { content: string }[]): Promise<T> {
    this.prompts.push(messages.map((m) => m.content).join('\n'));
    const design: Partial<SystemDesign> = {
      architecture: 'modular_monolith',
      architectureRationale: 'Given the tight budget, a modular monolith is preferred.',
      techStack: [{ layer: 'backend', technology: 'Node.js with Express', rationale: 'ease of development' }],
      services: [
        { name: 'Order Service', responsibility: 'Manages order placement, confirmation, and updates', dependencies: [], complexity: 'M', complexityRationale: 'x' },
        { name: 'Inventory Service', responsibility: 'Manages inventory updates and low-stock alerts', dependencies: ['Order Service'], complexity: 'S', complexityRationale: 'x' },
        { name: 'Payment Service', responsibility: 'Handles payment processing for orders', dependencies: ['Order Service'], complexity: 'M', complexityRationale: 'x' },
      ],
      buildVsBuy: [
        {
          capability: 'payments',
          recommendation: 'buy',
          suggestedService: 'Stripe',
          rationale: 'Buying a payment service like Stripe is more cost-effective and faster to implement than building a custom payment solution, given the tight budget and timeline.',
          impact: 'time/cost',
        },
      ],
    };
    return design as T;
  }
}

function nourRequirements(): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-19T00:00:00.000Z',
    functional: [
      { id: 'FR-1', title: 'Order Placement', description: 'Customers can place orders for products with multiple sizes and colors', priority: 'must' },
      { id: 'FR-8', title: 'Coupon/Discount System', description: 'The owner can create coupons and discounts for customers', priority: 'should' },
    ],
    nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'Protects personal data' }],
    roles: [
      { name: 'Admin', description: 'The owner of the online store', permissions: ['manage products'] },
      { name: 'Packing/Shipping', description: 'Packs and ships orders', permissions: ['view orders'] },
    ],
    businessRules: [],
    constraints: ['Tight budget'],
    assumptions: [],
  };
}

describe('SystemArchitectAgent — Nour Boutique regressions', () => {
  const context: SystemDesignContext = {
    idea: 'An online women\'s clothing store',
    intent: null,
    requirements: nourRequirements(),
    slots: {
      target_market: { value: 'Gaza/West Bank, Palestine', confidence: 'high', source: 'explicit' },
      integrations: {
        value: 'WhatsApp Business API. Note: Stripe and PayPal are not available for merchants based in Palestine.',
        confidence: 'high',
        source: 'explicit',
      },
    },
  };

  it('puts the integrations slot in the prompt — the field that carried the constraint', async () => {
    const llm = new NourBoutiqueLlmProvider();
    await new SystemArchitectAgent(llm).generate('s1', context);

    const prompt = llm.prompts.join('\n');
    expect(prompt).toContain('not available for merchants based in Palestine');
    // And the market's own availability facts, looked up rather than recalled.
    expect(prompt).toMatch(/do NOT onboard merchants based in this market/i);
  });

  it('corrects the Stripe recommendation the model returns anyway', async () => {
    const design = await new SystemArchitectAgent(new NourBoutiqueLlmProvider()).generate(
      's1',
      context,
    );

    const payments = design.buildVsBuy?.find((b) => b.capability === 'payments');
    expect(payments).toBeDefined();
    expect(payments!.suggestedService).not.toMatch(/stripe/i);
    expect(payments!.rationale).toMatch(/do not onboard merchants based in Palestine/i);
    // Nothing anywhere in the artifact still presents Stripe as the choice.
    expect(JSON.stringify(design)).not.toMatch(/(?:like|such as) Stripe/i);
  });

  it('adds the identity service the model omitted', async () => {
    const design = await new SystemArchitectAgent(new NourBoutiqueLlmProvider()).generate(
      's1',
      context,
    );

    expect(design.services.some((s) => /auth/i.test(s.name))).toBe(true);
  });

  it('flags the requirement no service covers', async () => {
    const design = await new SystemArchitectAgent(new NourBoutiqueLlmProvider()).generate(
      's1',
      context,
    );

    expect(design.uncoveredRequirements).toContain('FR-8');
  });

  it('holds the same guarantees on the deterministic path', async () => {
    // The offline build must not be the more correct one — that inversion is how
    // the Stripe bug hid (the fallback already hedged; the LLM path did not).
    const design = await new SystemArchitectAgent(new MockLlmProvider()).generate(
      's1',
      context,
    );

    expect(JSON.stringify(design)).not.toMatch(/(?:like|such as) Stripe/i);
    expect(design.services.some((s) => /auth/i.test(s.name))).toBe(true);
  });
});

// ── the counter that skipped ─────────────────────────────────────────────────

describe('askedQuestionCount', () => {
  const turn = (id: string): InterviewExchange => ({
    question: { id, phase: InterviewPhase.Understanding, prompt: 'q' },
    answer: 'a',
  });

  it('ignores pasted call notes and slot corrections', () => {
    const history = [
      turn('call-notes'),
      turn('q1'),
      turn('q2'),
      turn('correction:budget_range'),
      turn('q3'),
    ];

    // Was `history.length` = 5, so the UI showed "Question 6 of 9" after three.
    expect(askedQuestionCount(history)).toBe(3);
  });

  it('counts a plain transcript unchanged', () => {
    expect(askedQuestionCount([turn('q1'), turn('q2')])).toBe(2);
    expect(askedQuestionCount([])).toBe(0);
  });
});
