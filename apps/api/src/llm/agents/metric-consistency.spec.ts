import {
  CONCURRENT_USER_RATIO,
  DEFAULT_LATENCY_SECONDS,
  parseLatencySeconds,
  parseUptimePercent,
  parseUserFigures,
  resolveServiceTargets,
  serviceTargetInput,
  serviceTargetsPromptBlock,
  type RequirementsSummary,
  type SlotMap,
} from '@archivato/shared';
import { MockLlmProvider } from '../mock-llm.provider';
import { ProductManagerAgent } from './product-manager.agent';
import { RequirementEngineerAgent } from './requirement-engineer.agent';

/**
 * The reported bug: the Vision page said "≤1.5 seconds per query" while the
 * System Design said "95% of dashboard/search <2s", for one requirement. The
 * cause was not a broken sync — each stage invented its own figure, and the
 * Product Manager could not have reused the requirement document's because its
 * context never contained one.
 *
 * These tests assert the property that makes that impossible: every stage
 * derives its numbers from the SAME pure resolution of the SAME interview, so
 * "the same number with the same unit" holds by construction rather than by a
 * sync step somebody has to remember.
 *
 * They run on the deterministic path (mock provider), which is what an install
 * with no LLM key ships — and which shipped its own hardcoded metrics before.
 */

const slots = (): SlotMap => ({
  scale_expectations: {
    value: 'Up to 1,000 users across the company.',
    source: 'explicit',
    confidence: 'high',
  },
  constraints: {
    value: 'Dashboard and search screens should load in under 2 seconds.',
    source: 'explicit',
    confidence: 'high',
  },
});

const summary = (): RequirementsSummary => ({
  goal: 'Give teams one place to track work',
  users: ['Manager', 'Team member'],
  features: ['Create and assign tasks', 'Search tasks'],
  constraints: ['Dashboard and search screens should load in under 2 seconds.'],
  scale: ['Up to 1,000 users across the company.'],
  businessRules: [],
  assumptions: [],
});

describe('shared service targets', () => {
  it('reads a stated latency and does not invent a second one', () => {
    expect(
      parseLatencySeconds('Dashboard and search should load in under 2 seconds.'),
    ).toBe(2);
    // Milliseconds normalize to seconds, so one unit reaches every consumer.
    expect(parseLatencySeconds('Search responds within 800ms.')).toBeCloseTo(0.8);
  });

  it('ignores a duration that is not about response time', () => {
    // "null, never a guess": a delivery window is not a latency target, and
    // reading one as the other would put a 6 into a performance requirement.
    expect(parseLatencySeconds('Deliver the project within 6 weeks.')).toBeNull();
  });

  it('reads uptime in either phrasing', () => {
    expect(parseUptimePercent('99.9% uptime during business hours')).toBe(99.9);
    expect(parseUptimePercent('Availability of at least 99.5%')).toBe(99.5);
  });

  it('proposes an unstated figure ONCE so every stage reuses it', () => {
    const targets = resolveServiceTargets({ scaleText: 'Up to 1,000 users' });
    expect(targets.latency).toEqual({
      key: 'latency',
      value: DEFAULT_LATENCY_SECONDS,
      unit: 'seconds',
      source: 'proposed',
    });
    // Resolving again from the same input gives the same figure — the property
    // that makes independent stages agree without talking to each other.
    expect(resolveServiceTargets({ scaleText: 'Up to 1,000 users' })).toEqual(
      targets,
    );
  });

  it('marks a stated figure as stated, not proposed', () => {
    const targets = resolveServiceTargets({
      constraintsText: 'Pages must respond in under 1.5 seconds.',
    });
    expect(targets.latency?.value).toBe(1.5);
    expect(targets.latency?.source).toBe('stated');
  });
});

describe('total users vs concurrent users', () => {
  it('never relabels a stated total as a concurrency figure', () => {
    // The reported substitution: "Up to 1,000 users" became "1,000 concurrent
    // active users" — a different and much larger claim.
    const targets = resolveServiceTargets({ scaleText: 'Up to 1,000 users' });

    expect(targets.totalUsers).toMatchObject({ value: 1_000, source: 'stated' });
    expect(targets.concurrentUsers?.value).not.toBe(1_000);
  });

  it('derives concurrency explicitly, as an auditable assumption', () => {
    const targets = resolveServiceTargets({ scaleText: 'Up to 1,000 users' });
    const concurrency = targets.concurrentUsers;

    expect(concurrency?.source).toBe('derived');
    expect(concurrency?.value).toBe(1_000 * CONCURRENT_USER_RATIO);
    // The rule travels with the number so a reader can check the arithmetic and
    // the client can correct the ratio.
    expect(concurrency?.derivation).toContain('10%');
    expect(concurrency?.derivation).toContain('1000');
  });

  it('keeps a stated concurrency figure separate from a stated total', () => {
    const figures = parseUserFigures(
      '4,000 concurrent users across 60,000 registered patients',
    );
    expect(figures).toEqual({ total: 60_000, concurrent: 4_000 });
  });

  it('does not derive a concurrency figure when one was stated', () => {
    const targets = resolveServiceTargets({
      scaleText: '500 concurrent users at peak',
    });
    expect(targets.concurrentUsers).toMatchObject({
      value: 500,
      source: 'stated',
    });
    expect(targets.concurrentUsers?.derivation).toBeUndefined();
  });

  it('warns the model off the substitution in the prompt block', () => {
    const block = serviceTargetsPromptBlock(
      resolveServiceTargets({ scaleText: 'Up to 1,000 users' }),
    );
    expect(block).toContain('Never describe the registered-user total as a concurrent-user count');
  });
});

describe('one figure across every artifact', () => {
  const targets = () => resolveServiceTargets(serviceTargetInput({ slots: slots(), summary: summary() }));

  it('every latency figure in the package resolves to ONE value', async () => {
    const llm = new MockLlmProvider();
    const vision = await new ProductManagerAgent(llm).generate('s1', {
      idea: 'A task board for small teams',
      intent: null,
      summary: summary(),
      slots: slots(),
    });
    const doc = await new RequirementEngineerAgent(llm).generate('s1', {
      idea: 'A task board for small teams',
      intent: null,
      history: [],
      summary: summary(),
      slots: slots(),
    });

    expect(targets().latency).toMatchObject({ value: 2, source: 'stated' });

    // The real assertion: gather EVERY latency claim either artifact makes and
    // check they collapse to a single figure. This is what the reported bug
    // violated — 1.5 on one page, 2 on another — and it is stronger than
    // comparing two hand-picked strings, because it also catches a third claim
    // appearing somewhere neither test looked.
    const figures = new Set(
      [
        ...vision.successMetrics.map((m) => m.target),
        ...doc.nonFunctional.map((n) => n.description),
        ...doc.constraints,
      ]
        .map(parseLatencySeconds)
        .filter((v): v is number => v !== null),
    );

    expect([...figures]).toEqual([2]);
  });

  it('states the shared figure once, in the client\'s own words when they gave them', async () => {
    // The client already worded this constraint themselves, so the document
    // keeps their sentence rather than printing a second, synonymous NFR — the
    // duplication its own prompt calls the most visible defect in the document.
    const doc = await new RequirementEngineerAgent(new MockLlmProvider()).generate('s1', {
      idea: 'A task board for small teams',
      intent: null,
      history: [],
      summary: summary(),
      slots: slots(),
    });

    const latencyClaims = doc.nonFunctional.filter(
      (n) => parseLatencySeconds(n.description) !== null,
    );
    expect(latencyClaims).toHaveLength(1);
    expect(latencyClaims[0].description).toContain('under 2 seconds');
  });

  it('the vision quotes registered users, not concurrent users', async () => {
    const pm = new ProductManagerAgent(new MockLlmProvider());
    const vision = await pm.generate('s1', {
      idea: 'A task board for small teams',
      intent: null,
      summary: summary(),
      slots: slots(),
    });

    const scaleMetric = vision.successMetrics.find((m) => /1000/.test(m.target));
    expect(scaleMetric?.target).toContain('registered users');
    expect(scaleMetric?.target).not.toMatch(/concurrent/i);
  });

  it('the requirement document states the derived concurrency as an assumption', async () => {
    const re = new RequirementEngineerAgent(new MockLlmProvider());
    const doc = await re.generate('s1', {
      idea: 'A task board for small teams',
      intent: null,
      history: [],
      summary: summary(),
      slots: slots(),
    });

    const concurrency = doc.nonFunctional.find((n) =>
      /same time/i.test(n.description),
    );
    expect(concurrency?.description).toContain('100');
    expect(concurrency?.description).toContain('Assumes about 10%');
  });

  it('an interview stating nothing still yields one shared figure everywhere', async () => {
    // The "fine for a page to propose a target" case — provided the SAME
    // proposal is what every other page then uses.
    const llm = new MockLlmProvider();
    const bare: RequirementsSummary = {
      goal: 'Track work',
      users: ['Manager'],
      features: ['Create tasks'],
      constraints: [],
      businessRules: [],
      assumptions: [],
    };

    const vision = await new ProductManagerAgent(llm).generate('s2', {
      idea: 'A task board',
      intent: null,
      summary: bare,
    });
    const doc = await new RequirementEngineerAgent(llm).generate('s2', {
      idea: 'A task board',
      intent: null,
      history: [],
      summary: bare,
    });

    const metric = vision.successMetrics.find((m) => /respond/i.test(m.target));
    const nfr = doc.nonFunctional.find((n) => /respond/i.test(n.description));
    expect(metric!.target).toBe(nfr!.description);
    expect(metric!.target).toContain(`${DEFAULT_LATENCY_SECONDS} seconds`);
  });
});
