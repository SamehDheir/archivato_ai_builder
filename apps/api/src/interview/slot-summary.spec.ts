import type { SlotMap, SlotValue } from '@archivato/shared';
import { hasFilledSlots, splitSlotList, summaryFromSlots } from './slots';

const explicit = (value: string): SlotValue => ({
  value,
  confidence: 'high',
  source: 'explicit',
});

/**
 * The slot snapshot from the "Nour Boutique" scoping run that produced the
 * original report — a fashion e-commerce bid whose requirement document listed
 * the data-entity, integrations and market answers as USER ROLES, and derived a
 * single functional requirement from the industry description.
 */
const NOUR: SlotMap = {
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
};

describe('splitSlotList', () => {
  it('splits an inline numbered enumeration into discrete items', () => {
    const items = splitSlotList(
      '1. Product — name, description, category. 2. Order — items and totals. 3. Coupon — code and discount.',
    );

    expect(items).toHaveLength(3);
    expect(items[0]).toBe('Product — name, description, category.');
    expect(items[2]).toBe('Coupon — code and discount.');
  });

  it('splits a newline list and strips bullet markers', () => {
    expect(splitSlotList('- Admin\n- Customer Service\n- Shipping Staff')).toEqual([
      'Admin',
      'Customer Service',
      'Shipping Staff',
    ]);
  });

  it('splits a comma list of short nouns', () => {
    expect(splitSlotList('Product, Order, Coupon')).toEqual([
      'Product',
      'Order',
      'Coupon',
    ]);
  });

  it('does NOT shred prose on its commas', () => {
    // One workflow described in one sentence — three requirements would be wrong.
    const prose =
      'Customers browse the catalog, add items to their cart, and check out with cash on delivery';
    expect(splitSlotList(prose)).toEqual([prose]);
  });

  it('does not split a single hyphenated phrase', () => {
    const text = "women's clothing - a DTC brand selling online";
    expect(splitSlotList(text)).toEqual([text]);
  });

  it('deduplicates and tolerates empty input', () => {
    expect(splitSlotList('Order, order, Order')).toEqual(['Order']);
    expect(splitSlotList('')).toEqual([]);
    expect(splitSlotList('   ')).toEqual([]);
  });

  it('caps a runaway list', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Item ${i}`).join('\n');
    expect(splitSlotList(many).length).toBeLessThanOrEqual(12);
  });
});

describe('hasFilledSlots', () => {
  it('is false for absent, empty, and n/a-only maps', () => {
    expect(hasFilledSlots(undefined)).toBe(false);
    expect(hasFilledSlots({})).toBe(false);
    expect(
      hasFilledSlots({
        timeline: { value: '', confidence: 'low', source: 'inferred', na: true },
      }),
    ).toBe(false);
  });

  it('is true once any slot carries a value', () => {
    expect(hasFilledSlots({ business_domain: explicit('e-commerce') })).toBe(true);
  });
});

describe('summaryFromSlots', () => {
  it('reads user roles from the roles slot only', () => {
    const summary = summaryFromSlots(NOUR);

    expect(summary.users).toEqual([
      'Admin/Owner',
      'Customer Service',
      'Shipping/Packing Staff',
      'Customer',
    ]);
  });

  it('never lets another answer become a role (the reported bug)', () => {
    const roles = summaryFromSlots(NOUR).users ?? [];
    const joined = roles.join(' | ');

    expect(joined).not.toContain('Payment gateways');
    expect(joined).not.toContain('Palestine');
    expect(joined).not.toContain('Product Variant');
    expect(joined).not.toContain('browses the catalog');
  });

  it('derives one feature per workflow step, not one from the industry', () => {
    const features = summaryFromSlots(NOUR).features ?? [];

    expect(features.length).toBeGreaterThanOrEqual(6);
    expect(features.join(' ')).not.toContain('DTC brand selling');
    expect(features.some((f) => /inventory/i.test(f))).toBe(true);
    expect(features.some((f) => /whatsapp/i.test(f))).toBe(true);
    expect(features.some((f) => /coupon/i.test(f))).toBe(true);
  });

  it('falls back to data entities only when no workflow was captured', () => {
    const { core_workflows: _dropped, ...noWorkflow } = NOUR;
    const features = summaryFromSlots(noWorkflow).features ?? [];

    expect(features).toContain('Product Variant');
    expect(features).toContain('Inventory Log');
  });

  it('omits a field entirely when its slot is unfilled', () => {
    const summary = summaryFromSlots({ business_domain: explicit('retail') });

    expect(summary.users).toBeUndefined();
    expect(summary.features).toBeUndefined();
    expect(summary.constraints).toBeUndefined();
  });

  it('tolerates an absent map (plan-mode run)', () => {
    expect(summaryFromSlots(undefined)).toEqual({});
  });
});
