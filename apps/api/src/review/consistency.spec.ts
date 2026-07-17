import {
  buildConsistencyFindings,
  buildEffortEstimate,
  redactReviewForShare,
  type BuildVsBuyItem,
  type ConstraintCompliance,
  type ReviewReport,
  type ServiceCostLine,
  type ServiceModule,
} from '@archivato/shared';

function svc(name: string, complexity?: ServiceModule['complexity']): ServiceModule {
  return { name, responsibility: `${name}.`, dependencies: [], complexity };
}

const buy = (capability: BuildVsBuyItem['capability']): BuildVsBuyItem => ({
  capability,
  recommendation: 'buy',
  suggestedService: 'Stripe',
  rationale: 'x',
  impact: 'y',
});

/** A heavy design so the low-end effort is comfortably over a short deadline. */
const heavyEffort = buildEffortEstimate({
  services: [svc('A', 'XL'), svc('B', 'XL'), svc('C', 'L')],
  buildVsBuy: [],
});

describe('buildConsistencyFindings (R10 A2)', () => {
  it('flags effort that exceeds a stated timeline', () => {
    const findings = buildConsistencyFindings({
      effort: heavyEffort,
      timeline: '2 weeks',
    });
    const f = findings.find((x) => x.artifacts.join() === 'effort,timeline');
    expect(f).toBeDefined();
    expect(f!.source).toBe('automated');
  });

  it('is silent when the timeline comfortably fits', () => {
    const findings = buildConsistencyFindings({
      effort: heavyEffort,
      timeline: '2 years',
    });
    expect(findings.some((x) => x.artifacts.includes('timeline'))).toBe(false);
  });

  it('is silent when the timeline is unparseable (skip, never guess)', () => {
    const findings = buildConsistencyFindings({
      effort: heavyEffort,
      timeline: 'when it is ready',
    });
    expect(findings.some((x) => x.artifacts.includes('timeline'))).toBe(false);
  });

  it('flags a stated constraint with no compliance coverage', () => {
    const findings = buildConsistencyFindings({
      constraints: ['Must run on-premises', 'GDPR compliant'],
      constraintCompliance: [
        { constraint: 'GDPR compliant', howAddressed: 'EU-region hosting.' },
      ] as ConstraintCompliance[],
    });
    const f = findings.find((x) => x.artifacts.join() === 'constraints,constraintCompliance');
    expect(f).toBeDefined();
    expect(f!.detail).toContain('on-premises');
  });

  it('is silent when every constraint is covered', () => {
    const findings = buildConsistencyFindings({
      constraints: ['GDPR compliant'],
      constraintCompliance: [
        { constraint: 'GDPR compliant', howAddressed: 'EU-region hosting.' },
      ] as ConstraintCompliance[],
    });
    expect(findings).toHaveLength(0);
  });

  it('flags a bought capability with no cost line — only when a cost estimate exists', () => {
    const withEstimate = buildConsistencyFindings({
      buildVsBuy: [buy('payments')],
      serviceSubscriptions: [] as ServiceCostLine[], // present but empty ⇒ real signal
    });
    expect(
      withEstimate.some((x) => x.artifacts.join() === 'buildVsBuy,serviceSubscriptions'),
    ).toBe(true);

    // No cost estimate to compare against ⇒ skip the check (undefined, not []).
    const noEstimate = buildConsistencyFindings({ buildVsBuy: [buy('payments')] });
    expect(noEstimate).toHaveLength(0);
  });

  it('is silent when the bought capability has a matching cost line', () => {
    const findings = buildConsistencyFindings({
      buildVsBuy: [buy('payments')],
      serviceSubscriptions: [
        { capability: 'payments', label: 'Payments', monthlyUsd: null, basis: 'usage-based' },
      ],
    });
    expect(findings).toHaveLength(0);
  });
});

describe('redactReviewForShare (R10 security)', () => {
  const review: ReviewReport = {
    sessionId: 's1',
    generatedAt: new Date().toISOString(),
    overallScore: 80,
    scores: { security: 80, scalability: 80, performance: 80, cost: 80, clientReadiness: 65 },
    scalabilityScore: 80,
    summary: 'ok',
    securityIssues: [{ title: 'S', detail: 'd', severity: 'low' }],
    scalabilityIssues: [],
    performanceRisks: [],
    costOptimizations: [],
    missingFeatures: [],
    recommendations: [],
    clientReadinessIssues: [
      {
        title: 'Deal risk',
        detail: 'ambiguous',
        severity: 'high',
        suggestedResolution: 'tighten_requirement',
        resolutionHint: 'fix it',
      },
    ],
    consistencyFindings: [
      { title: 'C', detail: 'd', severity: 'medium', source: 'automated', artifacts: ['effort', 'timeline'] },
    ],
    clientReadinessNote: 'needs AI review',
  };

  it('strips the owner-only client-readiness + consistency fields', () => {
    const pub = redactReviewForShare(review);
    expect(pub.clientReadinessIssues).toEqual([]);
    expect(pub.consistencyFindings).toEqual([]);
    expect(pub.clientReadinessNote).toBeUndefined();
    expect(pub.scores.clientReadiness).toBeUndefined();
    // …but the engineering findings survive (the review is in the appendix).
    expect(pub.securityIssues).toHaveLength(1);
    expect(pub.overallScore).toBe(80);
    // Nothing deal-sensitive survives serialization.
    expect(JSON.stringify(pub)).not.toContain('Deal risk');
    expect(JSON.stringify(pub)).not.toContain('needs AI review');
  });
});
