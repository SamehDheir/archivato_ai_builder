import {
  buildConsistencyFindings,
  costProviderName,
  estimateCosts,
  hostingConstraintFromDesign,
  resolveHostingChoice,
  runtimeStyleFromDesign,
  type CostEstimateInput,
  type CostProviderId,
  type SystemDesign,
} from '@archivato/shared';

/**
 * The Cost stage must reflect the host the System Design actually chose.
 *
 * The reported failure, verbatim from a real stored estimate: a project whose
 * System Design chose **Azure App Service (Linux) – Jordan region** — justified
 * by a data-residency requirement, and confirmed again in its Roadmap — was
 * shown a comparison across eight providers containing no Azure, headlined
 * **Fly.io** as best value, and explained itself with
 *
 *   "The System Design did not name a host we price, so Fly.io is shown as the
 *    lowest-cost option that can actually run this design."
 *
 * Every stage ran, nothing errored, and the sentence was false. The hosting
 * choice was carried as `CostProviderId | null`, so "named nothing" and "named
 * something outside our table" arrived at the reconciler as the same value, and
 * only one of them has "fall back to the cheapest" as a correct response.
 *
 * These tests pin the fix at the level it was made — the *class*, not the case.
 * Azure being priced now is necessary but not sufficient: the third state has to
 * hold for the host nobody has priced yet, which is why the generality suite
 * below runs providers we price, a provider we do not, and an infeasible one.
 */

const stack = (
  rows: [layer: string, technology: string, rationale?: string][],
): Pick<SystemDesign, 'techStack'> => ({
  techStack: rows.map(([layer, technology, rationale]) => ({
    layer,
    technology,
    rationale: rationale ?? 'n/a',
  })),
});

/** The reported project, reduced to the rows that decide hosting. */
const AZURE_JORDAN = stack([
  ['backend', 'NestJS (Node.js)', 'Modular structure fits a monolith.'],
  [
    'database',
    'Azure Database for PostgreSQL – Jordan region',
    'Meets data-residency requirement, offers built-in encryption at rest.',
  ],
  [
    'hosting',
    'Azure App Service (Linux) – Jordan region',
    'Managed PaaS removes need for DevOps staff, provides 99.5% SLA.',
  ],
]);

const workload: CostEstimateInput = {
  sessionId: 's-azure',
  services: 6,
  entities: 12,
  endpoints: 48,
  databaseType: 'PostgreSQL',
  architecture: 'modular_monolith',
};

const estimateFor = (design: Pick<SystemDesign, 'techStack'>) =>
  estimateCosts({
    ...workload,
    profile: {
      chosenHosting: resolveHostingChoice(design),
      hostingConstraint: hostingConstraintFromDesign(design),
      runtime: runtimeStyleFromDesign(design),
    },
  });

describe('the reported bug: an Azure project told no host was named', () => {
  it('reads Azure App Service as the chosen host', () => {
    expect(resolveHostingChoice(AZURE_JORDAN)).toEqual({
      kind: 'priced',
      provider: 'azure',
      label: 'Azure App Service (Linux) – Jordan region',
    });
  });

  it('headlines Azure, not the cheapest generic provider', () => {
    const e = estimateFor(AZURE_JORDAN);
    expect(e.hosting?.provider).toBe('azure');
    expect(e.hosting?.source).toBe('system-design');
    expect(e.hosting?.provider).not.toBe('flyio');
  });

  it('never claims no host was named', () => {
    const e = estimateFor(AZURE_JORDAN);
    // The exact reported sentence, and the claim underneath it.
    expect(e.hosting?.rationale).not.toContain('did not name a host');
    expect(e.hosting?.rationale).not.toMatch(/does not name a hosting provider/i);
    expect(e.hosting?.rationale).toContain('Azure App Service');
  });

  it('prices Azure itself, at every scale', () => {
    const e = estimateFor(AZURE_JORDAN);
    const azure = e.providers.find((p) => p.provider === 'azure');
    expect(azure).toBeDefined();
    expect(azure!.costs).toHaveLength(e.scales.length);
    expect(azure!.costs.every((c) => c.monthlyUsd > 0)).toBe(true);
    expect(azure!.fit?.viable).toBe(true);
  });

  it('quotes the design’s own wording, not just the provider name', () => {
    // "Microsoft Azure" loses the region, which is the part that was load-bearing.
    expect(estimateFor(AZURE_JORDAN).hosting?.chosenLabel).toBe(
      'Azure App Service (Linux) – Jordan region',
    );
  });
});

describe('compliance-driven constraints survive the price comparison', () => {
  it('detects the residency constraint even when it sits on another row', () => {
    // On the real project the hosting row talked about SLAs and DevOps staffing;
    // "Meets data-residency requirement" was on the DATABASE row. Reading only
    // the hosting row would have missed the constraint that mattered.
    const constraint = hostingConstraintFromDesign(AZURE_JORDAN);
    expect(constraint).not.toBeNull();
    expect(constraint!.region).toBe('Jordan');
    expect(constraint!.evidence).toMatch(/residency/i);
  });

  it('flags the compliance trade-off rather than presenting a pure cost win', () => {
    const note = estimateFor(AZURE_JORDAN).hosting?.constraintNote ?? '';
    expect(note).toContain('Jordan');
    expect(note).toMatch(/residency/i);
    // It must not assert an unverifiable fact about another provider's regions —
    // it tells the owner to check, which is the honest claim we can make.
    expect(note).toMatch(/has to offer|does not check/i);
  });

  it('still shows the cheaper alternative — flagged, not suppressed', () => {
    // The point is an informed decision, not a hidden one.
    const e = estimateFor(AZURE_JORDAN);
    expect(e.hosting?.alternative).toBeDefined();
    expect(e.hosting?.constraintNote).toBeTruthy();
  });

  it('stays silent when the design states no locality requirement', () => {
    const plain = stack([
      ['backend', 'NestJS (Node.js)'],
      ['hosting', 'Render.com'],
    ]);
    expect(hostingConstraintFromDesign(plain)).toBeNull();
    expect(estimateFor(plain).hosting?.constraintNote).toBeUndefined();
  });

  it('reads an Arabic residency statement', () => {
    // `\b` is ASCII-only and never fires next to Arabic script, so an anchored
    // pattern would be a permanently silent check in this product's own market.
    const ar = stack([
      ['hosting', 'AWS', 'يشترط العميل إقامة البيانات داخل المملكة.'],
    ]);
    expect(hostingConstraintFromDesign(ar)).not.toBeNull();
  });
});

describe('generality — any provider the design names, not just Azure', () => {
  const cases: [name: string, technology: string, expected: CostProviderId][] = [
    ['AWS', 'AWS Elastic Beanstalk (eu-central-1)', 'aws'],
    ['Google Cloud', 'Google Cloud Run', 'gcp'],
    ['DigitalOcean', 'DigitalOcean App Platform', 'digitalocean'],
    ['Heroku', 'Heroku Standard dynos', 'heroku'],
    ['a self-hosted VPS', 'Self-hosted VPS (Hetzner CX32)', 'vps'],
  ];

  it.each(cases)(
    'reflects %s when the System Design chose it',
    (_label, technology, expected) => {
      const e = estimateFor(stack([['backend', 'NestJS'], ['hosting', technology]]));
      expect(e.hosting?.provider).toBe(expected);
      expect(e.hosting?.source).toBe('system-design');
      expect(e.hosting?.rationale).not.toMatch(/does not name a hosting provider/i);
      // And the row is priced, so the table compares against a real bill.
      expect(
        e.providers.find((p) => p.provider === expected)!.costs[1].monthlyUsd,
      ).toBeGreaterThan(0);
    },
  );

  it('does not substitute a cheaper "best value" for the chosen host', () => {
    // Heroku is the most expensive provider priced here, so this is the case a
    // pure argmin would always overturn.
    const e = estimateFor(stack([['backend', 'NestJS'], ['hosting', 'Heroku']]));
    expect(e.hosting?.provider).toBe('heroku');
    // The cheaper option is offered as an explicit, quantified alternative —
    // never as a silently competing headline.
    expect(e.hosting?.alternative?.provider).not.toBe('heroku');
    expect(e.hosting?.alternative?.monthlySavingUsd).toBeGreaterThan(0);
  });

  it('reports an unpriced host honestly instead of pretending none was named', () => {
    // The state that still exists after widening the table, and always will:
    // a regional cloud, a local datacentre, on-premise hardware.
    const e = estimateFor(
      stack([['backend', 'NestJS'], ['hosting', 'On-premise servers at the ministry']]),
    );
    expect(e.hosting?.source).toBe('design-unpriced');
    expect(e.hosting?.chosenLabel).toBe('On-premise servers at the ministry');
    expect(e.hosting?.rationale).toContain('On-premise servers at the ministry');
    expect(e.hosting?.rationale).not.toMatch(/does not name a hosting provider/i);
    // It must not let the reader take the figures as that host's bill.
    expect(e.hosting?.rationale).toMatch(/does not price|check its published/i);
  });

  it('says so when the chosen host cannot run the design', () => {
    const e = estimateFor(
      stack([['backend', 'NestJS (long-running server)'], ['hosting', 'Cloudflare Workers']]),
    );
    expect(e.hosting?.source).toBe('design-not-viable');
    expect(e.hosting?.provider).not.toBe('cloudflare');
    expect(e.hosting?.rationale).toMatch(/cannot run this design/i);
    expect(e.hosting?.rationale).not.toMatch(/does not name a hosting provider/i);
  });

  it('keeps the honest "no host named" line for a design that names none', () => {
    // The sentence is correct here, and must stay reachable — the fix is that it
    // is reachable ONLY here.
    const e = estimateFor(stack([['backend', 'NestJS'], ['frontend', 'React']]));
    expect(e.hosting?.source).toBe('cheapest-viable');
    expect(e.hosting?.rationale).toMatch(/does not name a hosting provider/i);
  });

  it('never pitches a self-managed VPS as the money-saving switch', () => {
    // It is the cheapest row at every scale, and its bill excludes the ops
    // labour every managed provider here includes — so recommending the switch
    // would price a team's operations work at zero.
    const e = estimateFor(stack([['backend', 'NestJS'], ['hosting', 'Heroku']]));
    expect(e.hosting?.alternative?.provider).not.toBe('vps');
    expect(
      e.providers.find((p) => p.provider === 'vps')!.fit?.caveat,
    ).toMatch(/self-managed/i);
  });
});

describe('the consistency check catches a drift the reconciliation cannot', () => {
  const costHosting = (provider: CostProviderId, source: 'system-design') => ({
    provider,
    source,
    rationale: 'n/a',
  });

  it('is silent when the two stages agree', () => {
    expect(
      buildConsistencyFindings({
        designHosting: resolveHostingChoice(AZURE_JORDAN),
        costHosting: costHosting('azure', 'system-design'),
      }),
    ).toHaveLength(0);
  });

  it('flags a stale estimate built against a host the design has since left', () => {
    const findings = buildConsistencyFindings({
      designHosting: resolveHostingChoice(AZURE_JORDAN),
      costHosting: costHosting('flyio', 'system-design'),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].detail).toContain('Azure App Service');
    expect(findings[0].detail).toContain('flyio');
    expect(findings[0].artifacts).toEqual(['the architecture', 'the cost estimate']);
  });

  it('flags a chosen host the comparison cannot price', () => {
    const findings = buildConsistencyFindings({
      designHosting: { kind: 'unpriced', label: 'On-premise servers' },
      costHosting: { provider: 'flyio', source: 'design-unpriced', rationale: 'n/a' },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain('On-premise servers');
  });

  it('says nothing when there is no cost estimate to contradict', () => {
    expect(
      buildConsistencyFindings({ designHosting: resolveHostingChoice(AZURE_JORDAN) }),
    ).toHaveLength(0);
  });

  it('says nothing when the design named no host', () => {
    expect(
      buildConsistencyFindings({
        designHosting: { kind: 'none' },
        costHosting: costHosting('flyio', 'system-design'),
      }),
    ).toHaveLength(0);
  });
});

describe('the priced set', () => {
  it('names every provider it prices', () => {
    // A provider in the type but not the pricing table would render as its raw
    // id in the comparison, and price as nothing.
    for (const id of ['azure', 'gcp', 'vps'] as CostProviderId[]) {
      expect(costProviderName(id)).not.toBe(id);
    }
  });
});
