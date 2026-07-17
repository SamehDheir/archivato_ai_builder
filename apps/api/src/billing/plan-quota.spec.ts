import {
  annualSavings,
  countInQuotaPeriod,
  isUnlimitedQuota,
  monthlyEquivalent,
  PLANS,
  planPriceForCycle,
  startOfQuotaPeriod,
} from '@archivato/shared';

/**
 * The advertised tiers and what billing actually charges must agree — the landing
 * page reads its price from `PLANS`, so these lock the numbers a customer reads.
 */
describe('PLANS (Starter / Team)', () => {
  it('markets the tiers as Starter and Team while keeping the internal ids', () => {
    expect(PLANS.free.plan).toBe('free');
    expect(PLANS.free.name).toBe('Starter');
    expect(PLANS.pro.plan).toBe('pro');
    expect(PLANS.pro.name).toBe('Team');
  });

  it('charges $79/mo and $758/yr for Team', () => {
    expect(PLANS.pro.priceUsd).toBe(79);
    expect(PLANS.pro.annualPriceUsd).toBe(758);
    expect(planPriceForCycle(PLANS.pro, 'monthly')).toBe(79);
    expect(planPriceForCycle(PLANS.pro, 'annual')).toBe(758);
  });

  it('keeps the annual discount at ~20% off twelve months', () => {
    const saving = annualSavings(PLANS.pro);
    expect(saving.fullUsd).toBe(948);
    expect(saving.annualUsd).toBe(758);
    expect(saving.savePct).toBe(20);
    // Annual normalizes to ~$63/mo — the figure admin MRR and the "/mo" copy use.
    expect(monthlyEquivalent(PLANS.pro, 'annual')).toBeCloseTo(63.17, 1);
  });

  it('gives Starter 1 design per month and Team unlimited', () => {
    expect(PLANS.free.projectQuota).toBe(1);
    expect(isUnlimitedQuota(PLANS.free.projectQuota)).toBe(false);

    // Unlimited is null — never 0 (which would block everything) and never a big
    // number standing in for "no limit" (which a later edit could enforce).
    expect(PLANS.pro.projectQuota).toBeNull();
    expect(isUnlimitedQuota(PLANS.pro.projectQuota)).toBe(true);
  });
});

describe('quota period (R: 1 design per month)', () => {
  it('starts at the first instant of the UTC month', () => {
    const start = startOfQuotaPeriod(new Date('2026-07-16T10:30:00Z'));
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('counts only the projects created in the current period', () => {
    const now = new Date('2026-07-16T10:00:00Z');
    const used = countInQuotaPeriod(
      [
        '2026-07-02T09:00:00Z', // this month
        '2026-07-15T23:59:00Z', // this month
        '2026-06-30T23:59:59Z', // last month — the allowance reset
        '2025-07-05T00:00:00Z', // a year ago
      ],
      now,
    );
    expect(used).toBe(2);
  });

  it('counts a project created at the very start of the month', () => {
    const now = new Date('2026-07-16T10:00:00Z');
    expect(countInQuotaPeriod(['2026-07-01T00:00:00.000Z'], now)).toBe(1);
  });

  it('is empty when nothing was created this period', () => {
    expect(countInQuotaPeriod([], new Date('2026-07-16T10:00:00Z'))).toBe(0);
  });
});
