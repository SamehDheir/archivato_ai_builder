import {
  buildBudgetCheck,
  buildEffortEstimate,
  buildServiceCostLines,
  computeSuggestedPrice,
  parseBudget,
  REFERENCE_RATES,
  type BuildVsBuyItem,
  type ServiceModule,
  type SystemDesign,
} from '@archivato/shared';

function svc(name: string, complexity?: ServiceModule['complexity']): ServiceModule {
  return { name, responsibility: `${name} things.`, dependencies: [], complexity };
}

function design(
  services: ServiceModule[],
  buildVsBuy: BuildVsBuyItem[] = [],
): Pick<SystemDesign, 'services' | 'buildVsBuy'> {
  return { services, buildVsBuy };
}

const buy = (capability: BuildVsBuyItem['capability']): BuildVsBuyItem => ({
  capability,
  recommendation: 'buy',
  suggestedService: 'SomeService',
  rationale: 'x',
  impact: 'y',
});

describe('buildEffortEstimate (R9)', () => {
  it('maps each complexity to its person-week range', () => {
    const est = buildEffortEstimate(
      design([svc('A', 'S'), svc('B', 'M'), svc('C', 'L'), svc('D', 'XL')]),
    );
    const line = (n: string) => est.lineItems.find((l) => l.label === n)!;
    expect([line('A').weeksMin, line('A').weeksMax]).toEqual([0.5, 1]);
    expect([line('B').weeksMin, line('B').weeksMax]).toEqual([1, 2.5]);
    expect([line('C').weeksMin, line('C').weeksMax]).toEqual([2.5, 5]);
    expect([line('D').weeksMin, line('D').weeksMax]).toEqual([5, 8]);
  });

  it('defaults a module with no complexity to M', () => {
    const est = buildEffortEstimate(design([svc('X')]));
    const x = est.lineItems.find((l) => l.label === 'X')!;
    expect([x.weeksMin, x.weeksMax]).toEqual([1, 2.5]);
  });

  it('collapses a bought capability that maps to a module to integration-only', () => {
    const est = buildEffortEstimate(
      design([svc('Payments', 'L')], [buy('payments')]),
    );
    const line = est.lineItems.find((l) => l.label === 'Payments')!;
    expect(line.kind).toBe('integration');
    // 0.25 × [2.5, 5] = [0.625, 1.25] → rounded to nearest 0.5 = [0.5, 1.5].
    expect([line.weeksMin, line.weeksMax]).toEqual([0.5, 1.5]);
  });

  it('adds a flat integration line for a bought capability with no matching module', () => {
    const est = buildEffortEstimate(design([svc('Core', 'M')], [buy('search')]));
    const integration = est.lineItems.find((l) => l.kind === 'integration');
    expect(integration).toBeDefined();
    expect([integration!.weeksMin, integration!.weeksMax]).toEqual([0.5, 1]);
  });

  it('adds the fixed line items (setup, QA 20%, DevOps, buffer 15%)', () => {
    const est = buildEffortEstimate(design([svc('A', 'M')]));
    const labels = est.lineItems.filter((l) => l.kind === 'fixed').map((l) => l.label);
    expect(labels).toEqual([
      'Project setup',
      'QA & testing',
      'Deployment & DevOps',
      'Contingency buffer',
    ]);
    const setup = est.lineItems.find((l) => l.label === 'Project setup')!;
    expect([setup.weeksMin, setup.weeksMax]).toEqual([1, 1]);
  });

  it('rounds every figure to 0.5 and totals equal the summed lines', () => {
    const est = buildEffortEstimate(
      design([svc('A', 'L'), svc('B', 'XL'), svc('C', 'S')]),
    );
    for (const l of est.lineItems) {
      expect(l.weeksMin * 2).toBe(Math.round(l.weeksMin * 2));
      expect(l.weeksMax * 2).toBe(Math.round(l.weeksMax * 2));
    }
    expect(est.weeksMin).toBe(est.lineItems.reduce((s, l) => s + l.weeksMin, 0));
    expect(est.weeksMax).toBe(est.lineItems.reduce((s, l) => s + l.weeksMax, 0));
    expect(est.weeksMax).toBeGreaterThan(est.weeksMin);
  });
});

describe('parseBudget (R9)', () => {
  it('parses "$5k"', () => {
    expect(parseBudget('$5k')).toEqual({ min: 5000, max: 5000 });
  });
  it('parses a range "5000-8000"', () => {
    expect(parseBudget('5000-8000')).toEqual({ min: 5000, max: 8000 });
  });
  it('parses "$5,000 to $8,000"', () => {
    expect(parseBudget('$5,000 to $8,000')).toEqual({ min: 5000, max: 8000 });
  });
  it('parses Arabic numerals "٥٠٠٠ دولار"', () => {
    expect(parseBudget('٥٠٠٠ دولار')).toEqual({ min: 5000, max: 5000 });
  });
  it('returns null for text with no usable figure', () => {
    expect(parseBudget("let's discuss it")).toBeNull();
    expect(parseBudget('')).toBeNull();
    expect(parseBudget(undefined)).toBeNull();
  });
  it('ignores noise numbers below $100 (e.g. "3pm")', () => {
    expect(parseBudget('call me at 3pm')).toBeNull();
  });
  it('does not read a following word starting with k/m as a multiplier', () => {
    expect(parseBudget('5000 monthly')).toEqual({ min: 5000, max: 5000 });
    expect(parseBudget('8000 max')).toEqual({ min: 8000, max: 8000 });
    expect(parseBudget('5000monthly')).toEqual({ min: 5000, max: 5000 });
  });
  it('still applies a standalone k/m multiplier', () => {
    expect(parseBudget('$5m')).toEqual({ min: 5_000_000, max: 5_000_000 });
    expect(parseBudget('40k-60k')).toEqual({ min: 40_000, max: 60_000 });
    expect(parseBudget('$5k')).toEqual({ min: 5000, max: 5000 });
  });
});

describe('buildBudgetCheck (R9)', () => {
  const effort = { lineItems: [], weeksMin: 8, weeksMax: 12 };

  it('warns when effort × low rate exceeds budget by more than 25%', () => {
    // 12 × 1200 = 14,400 vs $5,000 → ~188% over.
    const w = buildBudgetCheck(effort, '$5000', REFERENCE_RATES);
    expect(w).not.toBeNull();
    expect(w!.values.overPct).toBeGreaterThan(25);
    expect(w!.severity).toBe('critical');
  });

  it('is silent when the budget comfortably fits', () => {
    // 12 × 1200 = 14,400 vs $50,000 → under budget.
    expect(buildBudgetCheck(effort, '$50000', REFERENCE_RATES)).toBeNull();
  });

  it('is silent when the budget is missing / unparseable', () => {
    expect(buildBudgetCheck(effort, undefined, REFERENCE_RATES)).toBeNull();
    expect(buildBudgetCheck(effort, 'no idea yet', REFERENCE_RATES)).toBeNull();
  });

  it('surfaces the available mitigations', () => {
    const w = buildBudgetCheck(effort, '$5000', REFERENCE_RATES, {
      hasMvpPhase: true,
      hasOutOfScope: false,
    });
    expect(w!.links).toEqual({ mvpPhase: true, outOfScope: false });
  });
});

describe('buildServiceCostLines (R9)', () => {
  it('adds a usage-based line for a bought payments service', () => {
    const lines = buildServiceCostLines(design([], [buy('payments')]));
    const payments = lines.find((l) => l.capability === 'payments')!;
    expect(payments.basis).toBe('usage-based');
    expect(payments.monthlyUsd).toBeNull();
    expect(payments.suggestedService).toBe('SomeService');
  });

  it('adds a flat monthly line for a bought search service', () => {
    const lines = buildServiceCostLines(design([], [buy('search')]));
    expect(lines.find((l) => l.capability === 'search')!.monthlyUsd).toBe(29);
  });

  it('excludes "build" recommendations', () => {
    const lines = buildServiceCostLines(
      design([], [
        { capability: 'auth', recommendation: 'build', rationale: 'x', impact: 'y' },
      ]),
    );
    expect(lines).toHaveLength(0);
  });

  it('attaches a regional payments fee note when the target market is known', () => {
    const lines = buildServiceCostLines(design([], [buy('payments')]), {
      targetMarket: 'MENA / Gulf',
    });
    expect(lines.find((l) => l.capability === 'payments')!.feeNote).toContain('PSP');
  });

  it('omits the regional note when no target market is set', () => {
    const lines = buildServiceCostLines(design([], [buy('payments')]));
    expect(lines.find((l) => l.capability === 'payments')!.feeNote).toBeUndefined();
  });
});

describe('computeSuggestedPrice (R9)', () => {
  it('multiplies the effort range by the weekly rate', () => {
    expect(
      computeSuggestedPrice({ lineItems: [], weeksMin: 8, weeksMax: 12 }, 2000),
    ).toEqual({ min: 16000, max: 24000 });
  });
});
