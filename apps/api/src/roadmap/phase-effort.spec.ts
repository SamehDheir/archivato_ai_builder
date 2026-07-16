import {
  buildEffortEstimate,
  buildPhaseEffort,
  formatWeekRange,
  hasTimelineConflict,
  parseTimelineWeeks,
  type RoadmapPhase,
  type ServiceModule,
  type SystemDesign,
} from '@archivato/shared';

function svc(name: string, complexity?: ServiceModule['complexity']): ServiceModule {
  return { name, responsibility: `${name} things.`, dependencies: [], complexity };
}

function design(services: ServiceModule[]): Pick<SystemDesign, 'services' | 'buildVsBuy'> {
  return { services, buildVsBuy: [] };
}

function phase(name: string, moduleNames?: string[]): RoadmapPhase {
  return { name, goal: '', effort: '', dependsOn: [], milestones: [], moduleNames };
}

describe('parseTimelineWeeks (R10)', () => {
  it('parses weeks, months, days and years', () => {
    expect(parseTimelineWeeks('6 weeks')).toBeCloseTo(6);
    expect(parseTimelineWeeks('3 months')).toBeCloseTo(3 * 4.345);
    expect(parseTimelineWeeks('45 days')).toBeCloseTo(45 / 7);
    expect(parseTimelineWeeks('1 year')).toBeCloseTo(52);
  });

  it('takes the larger end of a range and reads Arabic numerals', () => {
    expect(parseTimelineWeeks('2-3 months')).toBeCloseTo(3 * 4.345);
    expect(parseTimelineWeeks('٦ أسابيع')).toBeCloseTo(6);
  });

  it('returns null when there is no number+unit', () => {
    expect(parseTimelineWeeks('as soon as possible')).toBeNull();
    expect(parseTimelineWeeks('')).toBeNull();
    expect(parseTimelineWeeks(null)).toBeNull();
  });
});

describe('hasTimelineConflict (R10)', () => {
  it('flags effort that exceeds the deadline by more than 10%', () => {
    // 8 weeks of effort vs a ~4-week deadline → conflict.
    expect(hasTimelineConflict(8, '1 month')).toBe(true);
  });

  it('does not flag effort that fits within the tolerance', () => {
    // ~4.3 weeks effort vs a ~4.3-week deadline → within 10%.
    expect(hasTimelineConflict(4.3, '1 month')).toBe(false);
    expect(hasTimelineConflict(4.7, '1 month')).toBe(false); // 4.7 < 4.345*1.1
  });

  it('never flags when the timeline is unparseable (no timeline → no conflict)', () => {
    expect(hasTimelineConflict(100, 'whenever')).toBe(false);
    expect(hasTimelineConflict(100, undefined)).toBe(false);
  });
});

describe('formatWeekRange (R10)', () => {
  it('formats a range and collapses an equal one', () => {
    expect(formatWeekRange(3, 5)).toBe('~3–5 wks');
    expect(formatWeekRange(4, 4)).toBe('~4 wks');
    expect(formatWeekRange(2.5, 4.5)).toBe('~2.5–4.5 wks');
  });
});

describe('buildPhaseEffort (R10)', () => {
  const effort = buildEffortEstimate(design([svc('A', 'M'), svc('B', 'L')]));

  it('sums each phase’s module effort lines and fills a week range', () => {
    const [p1, p2] = buildPhaseEffort(
      [phase('One', ['A']), phase('Two', ['B'])],
      effort,
    );
    expect(p1.weeksMin).toBeGreaterThan(0);
    expect(p2.weeksMax).toBeGreaterThan(0);
    // B (L) is heavier than A (M), so its phase carries the larger range.
    expect(p2.weeksMax!).toBeGreaterThan(p1.weeksMax!);
    // Every figure is a half-week planning number.
    for (const p of [p1, p2]) {
      expect((p.weeksMin! * 2) % 1).toBe(0);
      expect((p.weeksMax! * 2) % 1).toBe(0);
    }
  });

  it('allocates fixed items proportionally so an overhead-only phase is not starved', () => {
    const [core, hardening] = buildPhaseEffort(
      [phase('Core', ['A', 'B']), phase('Hardening', [])],
      effort,
    );
    // The hardening phase builds no modules but still gets a share of QA/DevOps.
    expect(hardening.weeksMin!).toBeGreaterThan(0);
    // …and the module-heavy phase gets the bigger slice.
    expect(core.weeksMax!).toBeGreaterThan(hardening.weeksMax!);
  });

  it('roughly conserves the total effort across phases', () => {
    const phases = buildPhaseEffort(
      [phase('One', ['A']), phase('Two', ['B'])],
      effort,
    );
    const sumMax = phases.reduce((s, p) => s + p.weeksMax!, 0);
    // Within a rounding tolerance of the estimate total.
    expect(Math.abs(sumMax - effort.weeksMax)).toBeLessThanOrEqual(1);
  });

  it('leaves phases untouched for an empty effort estimate', () => {
    const [p] = buildPhaseEffort(
      [phase('One', ['A'])],
      { lineItems: [], weeksMin: 0, weeksMax: 0 },
    );
    expect(p.weeksMin).toBe(0);
    expect(p.weeksMax).toBe(0);
  });
});
