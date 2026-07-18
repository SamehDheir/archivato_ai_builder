import type {
  RequirementDocument,
  RequirementsSummary,
  SlotMap,
  SlotValue,
} from '@archivato/shared';
import { RequirementEngineerAgent } from './requirement-engineer.agent';
import { SystemArchitectAgent } from './system-architect.agent';
import { MockLlmProvider } from '../mock-llm.provider';
import { summaryFromSlots } from '../../interview/slots';

/**
 * Regression suite for the "Nour Boutique" scoping run — a fashion e-commerce bid
 * whose generated package was wrong in four visible ways:
 *
 *  1. the User roles section listed the data-entity, integrations and market
 *     answers as roles;
 *  2. exactly one functional requirement was produced, restating the industry;
 *  3. the executive summary read "It lets them fashion — Fashion e-commerce…";
 *  4. the system design listed only Auth/Users/Billing/Notifications/Reporting,
 *     with no catalog, orders or inventory anywhere.
 *
 * All four came from the OFFLINE path (the run had no LLM provider configured),
 * so every assertion here runs against the deterministic fallbacks on purpose —
 * that is the code that produced the reported document.
 */

const explicit = (value: string): SlotValue => ({
  value,
  confidence: 'high',
  source: 'explicit',
});

const NOUR_SLOTS: SlotMap = {
  business_domain: explicit(
    "Fashion — Fashion e-commerce — women's clothing, DTC brand selling through a web storefront",
  ),
  target_users_roles: explicit(
    'Admin/Owner, Customer Service, Shipping/Packing Staff, Customer',
  ),
  target_market: explicit('Palestine (Gaza/West Bank)'),
  core_workflows: explicit(
    '1. Order placement: Customer browses the catalog, adds items to the cart and checks out with cash on delivery. ' +
      '2. Inventory decrement on order confirmation, preventing overselling. ' +
      '3. Order status lifecycle from pending through packed to delivered. ' +
      '4. WhatsApp notification to the customer on each status change. ' +
      '5. Coupon and discount redemption at checkout. ' +
      '6. Sales reporting for best sellers and monthly revenue.',
  ),
  data_entities: explicit(
    'Product, Product Variant, Order, Order Item, Inventory Log, Coupon',
  ),
  integrations: explicit('Payment gateways (e.g. PayPal, Stripe), Messaging services'),
  budget_range: explicit('$8,000'),
  timeline: explicit('10 weeks'),
};

/** The summary the interview now derives from those slots. */
function nourSummary(): RequirementsSummary {
  const derived = summaryFromSlots(NOUR_SLOTS);
  return {
    goal: 'Nour Boutique sells women’s clothing direct to consumers through an online storefront.',
    users: derived.users ?? [],
    features: derived.features ?? [],
    businessRules: [],
    constraints: derived.constraints ?? [],
    assumptions: [],
  };
}

async function nourRequirements(): Promise<RequirementDocument> {
  const agent = new RequirementEngineerAgent(new MockLlmProvider());
  return agent.generate('nour', {
    idea: "An online store for a women's clothing boutique",
    intent: null,
    history: [],
    summary: nourSummary(),
    slots: NOUR_SLOTS,
    openQuestions: [],
  });
}

describe('Nour Boutique scoping regression', () => {
  describe('requirement document', () => {
    it('lists only real roles — no entity, integration or market answers', async () => {
      const doc = await nourRequirements();
      const roleText = doc.roles.map((r) => `${r.name} ${r.description}`).join(' | ');

      expect(doc.roles.map((r) => r.name)).toEqual([
        'Admin/Owner',
        'Customer Service',
        'Shipping/Packing Staff',
        'Customer',
      ]);
      expect(roleText).not.toContain('Payment gateways');
      expect(roleText).not.toContain('Palestine');
      expect(roleText).not.toContain('browses the catalog');
    });

    it('derives a discrete requirement per workflow step, not one from the industry', async () => {
      const doc = await nourRequirements();
      const text = doc.functional.map((f) => `${f.title} ${f.description}`).join(' ');

      expect(doc.functional.length).toBeGreaterThanOrEqual(6);
      expect(doc.functional.map((f) => f.id)).toEqual(
        doc.functional.map((_, i) => `FR-${i + 1}`),
      );
      expect(text).toMatch(/inventory/i);
      expect(text).toMatch(/whatsapp/i);
      expect(text).toMatch(/coupon/i);
      expect(text).not.toContain('DTC brand selling');
    });

    it('writes a grammatical executive summary', async () => {
      const doc = await nourRequirements();
      const summary = doc.executiveSummary ?? '';

      // The exact broken splice from the report.
      expect(summary).not.toMatch(/It lets them [a-z]*\s*—/);
      expect(summary).not.toContain('It lets them fashion');
      // Every sentence is bounded and starts with a capital.
      for (const sentence of summary.split(/(?<=\.)\s+/).filter(Boolean)) {
        expect(sentence.trim()).toMatch(/^[A-Z]/);
        expect(sentence.trim().length).toBeLessThan(260);
      }
    });

    it('still never states the budget or the timeline', async () => {
      const doc = await nourRequirements();
      const json = JSON.stringify(doc);

      expect(json).not.toContain('$8,000');
      expect(json).not.toContain('10 weeks');
    });
  });

  describe('system design', () => {
    it('derives domain services from the entities, not a fixed template', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const design = await agent.generate('nour', {
        idea: "An online store for a women's clothing boutique",
        intent: null,
        requirements: await nourRequirements(),
        slots: NOUR_SLOTS,
      });
      const names = design.services.map((s) => s.name);

      expect(names).toContain('Products');
      expect(names).toContain('Orders');
      expect(names.some((n) => /inventory/i.test(n))).toBe(true);
      expect(names).toContain('Coupons');
      // The generic backbone is still present, not replaced.
      expect(names).toContain('Auth');
      expect(names).toContain('Users');
      // A "User"-shaped entity must not duplicate the Users service.
      expect(names.filter((n) => n.toLowerCase() === 'users')).toHaveLength(1);
    });

    it('invents no service from a placeholder answer', async () => {
      const agent = new SystemArchitectAgent(new MockLlmProvider());
      const design = await agent.generate('s1', {
        idea: 'x',
        intent: null,
        requirements: {
          sessionId: 's1',
          generatedAt: '2026-07-18T00:00:00.000Z',
          functional: [{ id: 'FR-1', title: 'x', description: 'x', priority: 'must' }],
          nonFunctional: [],
          roles: [],
          businessRules: [],
          constraints: [],
          assumptions: [],
        },
        slots: { data_entities: explicit('x, y') },
      });

      expect(design.services.map((s) => s.name)).toEqual(['Auth', 'Users']);
    });
  });
});
