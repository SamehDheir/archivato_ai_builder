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

describe('buildConsistencyFindings — constraint coverage', () => {
  // Verbatim from a real report where BOTH findings were false positives: the
  // design's compliance table covered both constraints, but substring matching
  // could not see through "integrate with existing" vs "integration with".
  const constraints = [
    'The platform must be developed using a cloud-based architecture.',
    'The platform must integrate with existing payment gateways and accounting software.',
    'The platform must comply with relevant regulatory requirements, including HIPAA and GDPR.',
  ];
  const constraintCompliance = [
    { constraint: 'cloud-based architecture', howAddressed: 'x' },
    {
      constraint: 'integration with payment gateways and accounting software',
      howAddressed: 'x',
    },
    { constraint: 'HIPAA and GDPR compliance', howAddressed: 'x' },
  ];

  it('treats a differently-worded compliance entry as coverage', () => {
    expect(
      buildConsistencyFindings({ constraints, constraintCompliance }),
    ).toEqual([]);
  });

  it('still fires when a constraint genuinely has no entry', () => {
    const findings = buildConsistencyFindings({
      constraints: [...constraints, 'The system must support offline access.'],
      constraintCompliance,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain('offline');
  });

  it('handles a constraint too short to produce tokens', () => {
    expect(
      buildConsistencyFindings({
        constraints: ['PCI DSS'],
        constraintCompliance: [
          { constraint: 'PCI DSS handled by the processor', howAddressed: 'x' },
        ],
      }),
    ).toEqual([]);
  });
});

describe('buildConsistencyFindings — scope integrity', () => {
  const promise = (label: string, artifact = 'the functional requirements') => ({
    label,
    artifact,
  });

  it('flags an excluded capability the requirements promise anyway', () => {
    const findings = buildConsistencyFindings({
      outOfScope: [{ item: 'Live GPS tracking of drivers on a map' }],
      promisedCapabilities: [
        promise('Customers can see live GPS tracking of their driver'),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('Excluded capability');
    expect(findings[0].artifacts).toContain('outOfScope');
    expect(findings[0].source).toBe('automated');
  });

  it('names the artifact that made the promise', () => {
    const findings = buildConsistencyFindings({
      outOfScope: [{ item: 'Telemedicine video consultations' }],
      promisedCapabilities: [
        promise('Telemedicine Video Service', 'the architecture'),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain('the architecture');
    expect(findings[0].artifacts).toContain('the architecture');
  });

  it('does not fire when only a broad qualifier overlaps', () => {
    // "Mobile Apps Gateway" is very likely an API gateway serving mobile
    // clients, not the native apps the document excluded. One shared word
    // ("mobile") is not enough to accuse the package of contradicting itself.
    const findings = buildConsistencyFindings({
      outOfScope: [{ item: 'Native mobile apps (iOS / Android)' }],
      promisedCapabilities: [promise('Mobile Apps Gateway', 'the architecture')],
    });
    expect(findings).toHaveLength(0);
  });

  it('does not fire on a single generic word in common', () => {
    // "Payouts to sellers" excluded while the build takes payments is a real and
    // deliberate distinction — flagging it would train the owner to ignore this.
    const findings = buildConsistencyFindings({
      outOfScope: [{ item: 'Multi-currency payouts to sellers' }],
      promisedCapabilities: [promise('Customers can pay for an order by card')],
    });
    expect(findings).toHaveLength(0);
  });

  it('does not fire on shared stop words alone', () => {
    const findings = buildConsistencyFindings({
      outOfScope: [{ item: 'Advanced analytics and custom reports' }],
      promisedCapabilities: [promise('Users can view their own data')],
    });
    expect(findings).toHaveLength(0);
  });

  it('matches a single-word exclusion only on that whole word', () => {
    expect(
      buildConsistencyFindings({
        outOfScope: [{ item: 'Telemedicine' }],
        promisedCapabilities: [promise('Patients can book a telemedicine visit')],
      }),
    ).toHaveLength(1);
    expect(
      buildConsistencyFindings({
        outOfScope: [{ item: 'Telemedicine' }],
        promisedCapabilities: [promise('Patients can book an in-clinic visit')],
      }),
    ).toHaveLength(0);
  });

  it('catches a contradiction stated in the requirement DESCRIPTION', () => {
    // Straight from a real project: the document excluded insurance claims and
    // then promised them inside FR-4's sentence. Matching titles alone missed it.
    const findings = buildConsistencyFindings({
      outOfScope: [{ item: 'Insurance claims and billing integration' }],
      promisedCapabilities: [
        {
          label: 'Billing and Payments',
          text: 'Billing and Payments. Accountants can generate invoices, process payments, and manage insurance claims.',
          artifact: 'the functional requirements',
        },
      ],
    });
    expect(findings).toHaveLength(1);
    // The finding quotes the short label, not the whole sentence it matched on.
    expect(findings[0].detail).toContain('Billing and Payments');
    expect(findings[0].detail).not.toContain('Accountants can generate');
  });

  it('does not flag the other exclusions from that same project', () => {
    const promisedCapabilities = [
      {
        label: 'Patient Registration',
        text: 'Patient Registration. Receptionists can register new patients and maintain complete patient profiles.',
        artifact: 'the functional requirements',
      },
      {
        label: 'Patient Portal',
        text: 'Patient Portal. Patients can access their medical records, book appointments, and make payments online.',
        artifact: 'the functional requirements',
      },
    ];
    const findings = buildConsistencyFindings({
      outOfScope: [
        { item: 'Telemedicine / live video consultations' },
        { item: 'Integration with external EHR / lab systems' },
        { item: 'Native patient and clinician mobile apps' },
        { item: 'Regulatory certification (e.g. HIPAA/GDPR attestation)' },
      ],
      promisedCapabilities,
    });
    expect(findings).toEqual([]);
  });

  it('stays silent with nothing to compare', () => {
    expect(
      buildConsistencyFindings({ outOfScope: [{ item: 'Live GPS tracking' }] }),
    ).toHaveLength(0);
    expect(
      buildConsistencyFindings({
        promisedCapabilities: [promise('Live GPS tracking')],
      }),
    ).toHaveLength(0);
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
