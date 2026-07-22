import {
  estimateCosts,
  hostingChoiceFromDesign,
  MEANINGFUL_SAVING_USD,
  providerFit,
  reconcileHosting,
  runtimeStyleFromDesign,
  type CostEstimateInput,
  type SystemDesign,
} from '@archivato/shared';

/**
 * Two bugs, one root: the cost estimator knew the prices and nothing else about
 * the project.
 *
 * 1. `bestFor` was a static per-provider string, so a 1,000-user MVP was told
 *    Cloudflare suits "edge-first apps and heavy traffic on a tight budget".
 * 2. The Cost tab crowned a "Best Value" independently of the host the System
 *    Design had already chosen, leaving two silently conflicting answers.
 *
 * These tests pin the fix in BOTH directions — a small MVP and a large,
 * high-traffic project — so the reasoning is verified to adapt rather than to
 * have been re-worded for the reported case.
 */

const design = (rows: [string, string][]): Pick<SystemDesign, 'techStack'> => ({
  techStack: rows.map(([layer, technology]) => ({
    layer,
    technology,
    rationale: 'n/a',
  })),
});

const NEST_ON_RENDER = design([
  ['backend', 'NestJS (TypeScript)'],
  ['database', 'PostgreSQL'],
  ['hosting', 'Render.com — single service for app and DB'],
]);

const smallMvp: CostEstimateInput = {
  sessionId: 's1',
  services: 4,
  entities: 6,
  endpoints: 24,
  databaseType: 'PostgreSQL',
  architecture: 'modular_monolith',
};

describe('reading the System Design hosting choice', () => {
  it('finds the provider named in the hosting layer', () => {
    expect(hostingChoiceFromDesign(NEST_ON_RENDER)).toBe('render');
    expect(runtimeStyleFromDesign(NEST_ON_RENDER)).toBe('long-running');
  });

  it('does not pick a provider named only in a rationale', () => {
    // Architect rationales name the REJECTED alternative ("Render over Heroku"),
    // so matching them would select the option that was explicitly turned down.
    const d: Pick<SystemDesign, 'techStack'> = {
      techStack: [
        {
          layer: 'hosting',
          technology: 'Render',
          rationale: 'Chosen over Heroku, which costs more at this size.',
        },
      ],
    };
    expect(hostingChoiceFromDesign(d)).toBe('render');
  });

  it('returns null rather than guessing when no known host is named', () => {
    expect(hostingChoiceFromDesign(design([['backend', 'NestJS']]))).toBeNull();
    expect(hostingChoiceFromDesign(null)).toBeNull();
  });

  it('reads an unrecognised stack as an unknown runtime, excluding nothing', () => {
    expect(runtimeStyleFromDesign(design([['backend', 'Bespoke runtime']]))).toBe(
      'unknown',
    );
    expect(providerFit('cloudflare', 'serverless', 'unknown').viable).toBe(true);
  });
});

describe('feasibility', () => {
  it('rules Cloudflare out for a long-running server, with a concrete reason', () => {
    const fit = providerFit('cloudflare', 'serverless', 'long-running');
    expect(fit.viable).toBe(false);
    expect(fit.note).toContain('Workers');
  });

  it('keeps Cloudflare viable for a genuinely serverless design', () => {
    expect(providerFit('cloudflare', 'serverless', 'serverless').viable).toBe(true);
  });

  it('caveats — but does not veto — other serverless hosts', () => {
    const fit = providerFit('vercel', 'serverless', 'long-running');
    expect(fit.viable).toBe(true);
    expect(fit.caveat).toContain('adapter');
  });

  it('never touches a normal server host', () => {
    expect(providerFit('render', 'paas', 'long-running')).toEqual({ viable: true });
  });
});

describe('the per-provider "why" is generated from the project', () => {
  it('does not reuse the static platform blurb', () => {
    const est = estimateCosts({
      ...smallMvp,
      profile: {
        scaleTier: 'small',
        totalUsers: 1000,
        concurrentUsers: 100,
        chosenProvider: 'render',
        runtime: 'long-running',
      },
    });
    const cloudflare = est.providers.find((p) => p.provider === 'cloudflare')!;

    // The exact reported string, and the register it belongs to.
    expect(cloudflare.rationale).not.toContain('Edge-first apps and heavy traffic');
    expect(cloudflare.rationale).toContain('Workers');
  });

  it('adapts the reasoning to the project size, not to a hardcoded case', () => {
    const profile = { runtime: 'long-running' as const };
    const small = estimateCosts({ ...smallMvp, profile });
    const large = estimateCosts({
      ...smallMvp,
      services: 14,
      entities: 40,
      endpoints: 180,
      profile,
    });

    const why = (e: typeof small, id: string) =>
      e.providers.find((p) => p.provider === id)!.rationale!;

    // Same provider, different projects, different stated reason — the property
    // a static template cannot have.
    expect(why(small, 'render')).not.toBe(why(large, 'render'));
    // And each cites the scale it was computed at.
    expect(why(small, 'render')).toContain('1000 users');
  });

  it('quotes concurrency separately from registered users', () => {
    const est = estimateCosts({
      ...smallMvp,
      profile: { totalUsers: 1000, concurrentUsers: 100, runtime: 'long-running' },
    });
    const render = est.providers.find((p) => p.provider === 'render')!;
    expect(render.rationale).toContain('100 users active at once');
  });
});

describe('reconciliation with the System Design', () => {
  const est = (chosen: ReturnType<typeof hostingChoiceFromDesign>) =>
    estimateCosts({
      ...smallMvp,
      profile: {
        scaleTier: 'small',
        totalUsers: 1000,
        concurrentUsers: 100,
        chosenProvider: chosen,
        runtime: 'long-running',
      },
    });

  it('headlines the System Design\'s host, not the arithmetic cheapest', () => {
    const e = est('render');
    // The legacy field still reports the raw cheapest — including a host that
    // cannot run this design — which is exactly why it is no longer the headline.
    expect(e.recommended).toBe('cloudflare');
    expect(e.hosting?.provider).toBe('render');
    expect(e.hosting?.source).toBe('system-design');
    expect(e.hosting?.rationale).toContain('System Design');
  });

  it('never headlines a host that cannot run the design', () => {
    const e = est(null);
    expect(e.hosting?.source).toBe('cheapest-viable');
    expect(e.hosting?.provider).not.toBe('cloudflare');
  });

  it('stays silent when the saving is not worth the churn', () => {
    // Render vs the cheapest viable host is a few dollars — not grounds to
    // reopen an architecture decision made against budget and timeline.
    expect(est('render').hosting?.alternative).toBeUndefined();
  });

  it('names a materially cheaper alternative, with the number', () => {
    const e = estimateCosts({
      ...smallMvp,
      services: 14,
      entities: 40,
      endpoints: 180,
      profile: { chosenProvider: 'heroku', runtime: 'long-running' },
    });
    const alt = e.hosting?.alternative;

    expect(e.hosting?.provider).toBe('heroku');
    expect(alt).toBeDefined();
    expect(alt!.monthlySavingUsd).toBeGreaterThanOrEqual(MEANINGFUL_SAVING_USD);
    expect(alt!.note).toContain('Heroku');
    expect(alt!.note).toContain(String(alt!.monthlySavingUsd));
  });

  it('never offers a caveated host as the alternative to switch to', () => {
    // "Switch to Vercel and save $135/mo" is not a like-for-like swap for a
    // long-running backend — it would be a fresh instance of the same bug.
    const e = estimateCosts({
      ...smallMvp,
      services: 14,
      entities: 40,
      endpoints: 180,
      profile: { chosenProvider: 'heroku', runtime: 'long-running' },
    });
    const alt = e.hosting!.alternative!;
    const provider = e.providers.find((p) => p.provider === alt.provider)!;

    expect(provider.fit?.caveat).toBeUndefined();
    expect(provider.fit?.viable).toBe(true);
  });

  it('returns null when nothing can host the design', () => {
    expect(
      reconcileHosting({
        candidates: [
          {
            provider: 'cloudflare',
            name: 'Cloudflare',
            monthlyUsd: 10,
            fit: { viable: false, note: 'no' },
          },
        ],
        chosenProvider: null,
      }),
    ).toBeNull();
  });
});
