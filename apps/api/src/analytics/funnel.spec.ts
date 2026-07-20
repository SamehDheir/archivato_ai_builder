import {
  ACTIVATION_WINDOW_DAYS,
  EVENT_ONLY_STEPS,
  FUNNEL_STEPS,
  buildFunnel,
  type FunnelReach,
  type FunnelSignup,
  type FunnelStep,
} from '@archivato/shared';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` before NOW. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function signup(userId: string, days: number): FunnelSignup {
  return { userId, signedUpAt: daysAgo(days) };
}

function reach(userId: string, step: FunnelStep, days: number): FunnelReach {
  return { userId, step, at: daysAgo(days) };
}

function stepUsers(
  funnel: ReturnType<typeof buildFunnel>,
  step: FunnelStep,
): number {
  return funnel.steps.find((s) => s.step === step)!.users;
}

describe('buildFunnel', () => {
  it('counts every signup as the first step, so the cohort is the denominator', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30), signup('b', 20), signup('c', 10)],
      reaches: [],
      now: NOW,
    });

    expect(stepUsers(funnel, 'signup')).toBe(3);
    expect(funnel.steps[0].percentOfCohort).toBe(100);
    // Nobody did anything else — the funnel is honest about that rather than
    // inheriting the previous step's count.
    expect(stepUsers(funnel, 'interview_started')).toBe(0);
    expect(stepUsers(funnel, 'share_created')).toBe(0);
  });

  it('emits every step in order, whether or not anyone reached it', () => {
    const funnel = buildFunnel({ signups: [signup('a', 30)], reaches: [], now: NOW });
    expect(funnel.steps.map((s) => s.step)).toEqual([...FUNNEL_STEPS]);
  });

  /**
   * The whole reason the input is a flat list: "reached it via an event OR via a
   * surviving state row" has to be an append, not a merge the caller can get
   * wrong. A user holding both must still count once.
   */
  it('unions the event and state sources without double-counting', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30)],
      reaches: [
        reach('a', 'share_created', 25), // from the analytics event
        reach('a', 'share_created', 25), // from the surviving ShareLink row
      ],
      now: NOW,
    });

    expect(stepUsers(funnel, 'share_created')).toBe(1);
    expect(funnel.steps.find((s) => s.step === 'share_created')!.percentOfCohort).toBe(100);
  });

  it('ignores reaches for users who no longer exist', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30)],
      reaches: [reach('deleted-user', 'share_created', 25)],
      now: NOW,
    });

    expect(stepUsers(funnel, 'share_created')).toBe(0);
  });

  it('reports conversion against both the cohort and the previous step', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30), signup('b', 30), signup('c', 30), signup('d', 30)],
      reaches: [
        reach('a', 'interview_started', 29),
        reach('b', 'interview_started', 29),
        reach('a', 'interview_confirmed', 28),
      ],
      now: NOW,
    });

    const started = funnel.steps.find((s) => s.step === 'interview_started')!;
    expect(started.users).toBe(2);
    expect(started.percentOfCohort).toBe(50); // 2 of 4 signups
    expect(started.percentOfPrevious).toBe(50); // 2 of 4 who signed up

    const confirmed = funnel.steps.find((s) => s.step === 'interview_confirmed')!;
    expect(confirmed.percentOfCohort).toBe(25); // 1 of 4 signups
    expect(confirmed.percentOfPrevious).toBe(50); // 1 of the 2 who started
  });

  /**
   * Deleting a project erases the session that proved the interview started, but
   * the append-only `share_created` event survives it. Forcing the funnel to
   * decline monotonically would invent a drop-off that never happened.
   */
  it('does not clamp a later step that outnumbers an earlier one', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30)],
      reaches: [reach('a', 'share_created', 25)],
      now: NOW,
    });

    expect(stepUsers(funnel, 'interview_started')).toBe(0);
    const shared = funnel.steps.find((s) => s.step === 'share_created')!;
    expect(shared.users).toBe(1);
    expect(shared.percentOfPrevious).toBe(0); // previous step is 0 — not NaN
    expect(shared.percentOfCohort).toBe(100);
  });

  it('marks export as the one step that cannot be counted retroactively', () => {
    const funnel = buildFunnel({ signups: [], reaches: [], now: NOW });
    const eventOnly = funnel.steps.filter((s) => !s.retroactive).map((s) => s.step);
    expect(eventOnly).toEqual([...EVENT_ONLY_STEPS]);
    expect(eventOnly).toEqual(['export']);
  });

  it('reports measurableFrom so an event-only undercount is legible', () => {
    expect(buildFunnel({ signups: [], reaches: [], now: NOW }).measurableFrom).toBeNull();

    const from = daysAgo(3);
    expect(
      buildFunnel({ signups: [], reaches: [], now: NOW, measurableFrom: from })
        .measurableFrom,
    ).toBe(from.toISOString());
  });

  it('survives an empty instance without dividing by zero', () => {
    const funnel = buildFunnel({ signups: [], reaches: [], now: NOW });
    expect(funnel.steps.every((s) => s.users === 0)).toBe(true);
    expect(funnel.steps.every((s) => s.percentOfCohort === 0)).toBe(true);
    expect(funnel.activation).toEqual({
      cohort: 0,
      activated: 0,
      percent: 0,
      windowDays: ACTIVATION_WINDOW_DAYS,
    });
  });
});

describe('activation rate', () => {
  it('counts a link sent inside the window', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30)],
      reaches: [reach('a', 'share_created', 27)], // day 3 of 7
      now: NOW,
    });

    expect(funnel.activation).toMatchObject({ cohort: 1, activated: 1, percent: 100 });
  });

  it('does not count a link sent after the window closed', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30)],
      reaches: [reach('a', 'share_created', 20)], // day 10 of 7
      now: NOW,
    });

    expect(funnel.activation).toMatchObject({ cohort: 1, activated: 0, percent: 0 });
  });

  /**
   * The correctness point that makes the number mean anything: an account that
   * signed up yesterday has not failed to activate, it has five days left. In the
   * cohort it would drag the rate down, and the rate would then move with signup
   * volume rather than with activation.
   */
  it('excludes signups whose window has not closed yet', () => {
    const funnel = buildFunnel({
      signups: [signup('old', 30), signup('yesterday', 1)],
      reaches: [reach('old', 'share_created', 28)],
      now: NOW,
    });

    expect(funnel.activation.cohort).toBe(1);
    expect(funnel.activation.percent).toBe(100);
  });

  it('takes the earliest share when a user sent several', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 60)],
      reaches: [
        reach('a', 'share_created', 20), // day 40 — outside
        reach('a', 'share_created', 56), // day 4  — inside
      ],
      now: NOW,
    });

    expect(funnel.activation.activated).toBe(1);
  });

  it('counts a reach a moment before signup rather than calling it a miss', () => {
    const signedUpAt = daysAgo(30);
    const funnel = buildFunnel({
      signups: [{ userId: 'a', signedUpAt }],
      reaches: [
        { userId: 'a', step: 'share_created', at: new Date(signedUpAt.getTime() - 500) },
      ],
      now: NOW,
    });

    expect(funnel.activation.activated).toBe(1);
  });

  it('only share_created activates — reaching a later step is not a substitute', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30)],
      reaches: [reach('a', 'export', 28), reach('a', 'first_artifact', 29)],
      now: NOW,
    });

    expect(funnel.activation.activated).toBe(0);
  });

  it('honours a custom window', () => {
    const signups = [signup('a', 30)];
    const reaches = [reach('a', 'share_created', 16)]; // day 14

    expect(buildFunnel({ signups, reaches, now: NOW, windowDays: 7 }).activation).toMatchObject({
      activated: 0,
      windowDays: 7,
    });
    expect(buildFunnel({ signups, reaches, now: NOW, windowDays: 30 }).activation).toMatchObject({
      activated: 1,
      windowDays: 30,
    });
  });

  it('rounds the rate rather than emitting a fraction', () => {
    const funnel = buildFunnel({
      signups: [signup('a', 30), signup('b', 30), signup('c', 30)],
      reaches: [reach('a', 'share_created', 29)],
      now: NOW,
    });

    expect(funnel.activation.percent).toBe(33); // 1/3
  });
});
