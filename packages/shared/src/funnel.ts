/**
 * The activation funnel — the one measurement this business runs on.
 *
 * The question is *"of 100 signups, how many sent a client link?"*, and until
 * now nothing could answer it: `AnalyticsEvent` recorded pageview / signup /
 * login / generate, with no stage boundaries at all.
 *
 * **Why a user reaches a step is resolved from two sources, deliberately.**
 * Analytics events are append-only and carry exact timing, but they only start
 * accumulating the day they ship — an events-only funnel would read 0% for every
 * user who already exists, which is the least useful version of the number it is
 * here to produce. Current state (a session row, a share link) is fully
 * retroactive but is erased by a delete and carries no history. So the caller
 * flattens **both** into `FunnelReach[]` and this module unions them: the event
 * is the durable record going forward, the state row is the retroactive floor.
 *
 * The union is why the input is a flat list rather than per-step sets — "reached
 * it either way" becomes an append, which cannot be got wrong.
 *
 * Runtime-free and pure, so the read-model stays a query and the arithmetic is
 * unit-testable without a database.
 */

/** The ordered steps a signup moves through, from account to delivered work. */
export const FUNNEL_STEPS = [
  'signup',
  'interview_started',
  'interview_confirmed',
  'first_artifact',
  'share_created',
  'share_viewed',
  'export',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/**
 * Steps with **no equivalent in current state**, so they can only be counted
 * from analytics events and therefore undercount anything that happened before
 * `AdminFunnel.measurableFrom`.
 *
 * Everything else has a retroactive source: a session row proves the interview
 * started, `status: 'confirmed'` proves it was confirmed, a requirement document
 * proves the first artifact, a `ShareLink` proves the link was created, and its
 * `viewCount` proves the client opened it. An export leaves nothing behind — it
 * streams a file and is gone — which is exactly why it needs the event.
 */
export const EVENT_ONLY_STEPS: readonly FunnelStep[] = ['export'];

/** Default activation window: sending a client link within 7 days of signup. */
export const ACTIVATION_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One account, and when it was created (`User.createdAt` — the authority). */
export interface FunnelSignup {
  userId: string;
  signedUpAt: Date;
}

/**
 * One user reaching one step, from either source. Duplicates are expected and
 * harmless — a user with both a `share_created` event and a live `ShareLink`
 * contributes two reaches and is counted once.
 */
export interface FunnelReach {
  userId: string;
  step: FunnelStep;
  at: Date;
}

/** One step's conversion, as the admin panel renders it. */
export interface FunnelStepResult {
  step: FunnelStep;
  /** Distinct users from the cohort who reached this step. */
  users: number;
  /** `users` as a share of all signups, 0..100 rounded. */
  percentOfCohort: number;
  /** `users` as a share of the previous step, 0..100 rounded. */
  percentOfPrevious: number;
  /** False for a step countable only from events (see `EVENT_ONLY_STEPS`). */
  retroactive: boolean;
}

/**
 * The headline number: what share of signups sent a client link inside the
 * window.
 *
 * The cohort is **only signups whose window has already closed**. Counting an
 * account created yesterday as "not activated" would drag the rate down with
 * users who simply have not run out of time yet, and the rate would then move
 * whenever signups did — measuring the wrong thing, confidently.
 */
export interface ActivationMetric {
  /** Signups old enough for the window to have closed. */
  cohort: number;
  activated: number;
  /** `activated / cohort`, 0..100 rounded. 0 when the cohort is empty. */
  percent: number;
  windowDays: number;
}

export interface AdminFunnel {
  steps: FunnelStepResult[];
  activation: ActivationMetric;
  /**
   * Earliest funnel **event** on record, or null when none exist yet. Below this
   * point the event-only steps have no data, so the panel can say so rather than
   * present an undercount as a conversion rate.
   */
  measurableFrom: string | null;
}

export interface BuildFunnelInput {
  signups: FunnelSignup[];
  reaches: FunnelReach[];
  now: Date;
  /** Earliest funnel event held, if any (see `AdminFunnel.measurableFrom`). */
  measurableFrom?: Date | null;
  windowDays?: number;
}

/**
 * Build the funnel over every signup.
 *
 * Deliberately **all-time, not a rolling window**: the denominator that matters
 * pre-revenue is "everyone who ever signed up", and a 30-day cohort on a product
 * with a handful of users is mostly empty. Trend is a separate question this does
 * not try to answer.
 *
 * Note that the steps are **not forced to be monotonic**. A user whose project
 * was deleted can hold a `share_created` event with no surviving session, so a
 * later step may exceed an earlier one and `percentOfPrevious` may pass 100.
 * Clamping it would fabricate a decline that did not happen; the honest reading
 * is that the earlier step lost its retroactive evidence.
 */
export function buildFunnel(input: BuildFunnelInput): AdminFunnel {
  const windowDays = input.windowDays ?? ACTIVATION_WINDOW_DAYS;
  const cohort = new Set(input.signups.map((s) => s.userId));

  // Only reaches belonging to a known account count — an event whose user has
  // since been deleted has no denominator to be a share of.
  const byStep = new Map<FunnelStep, Set<string>>();
  for (const step of FUNNEL_STEPS) byStep.set(step, new Set());
  for (const reach of input.reaches) {
    if (!cohort.has(reach.userId)) continue;
    byStep.get(reach.step)?.add(reach.userId);
  }

  const signups = cohort.size;
  let previous = signups;
  const steps: FunnelStepResult[] = FUNNEL_STEPS.map((step) => {
    // The first step IS the cohort: every account reached it by existing, and
    // `signup` events predate only some of them.
    const users = step === 'signup' ? signups : (byStep.get(step)?.size ?? 0);
    const result: FunnelStepResult = {
      step,
      users,
      percentOfCohort: percent(users, signups),
      percentOfPrevious: percent(users, previous),
      retroactive: !EVENT_ONLY_STEPS.includes(step),
    };
    previous = users;
    return result;
  });

  return {
    steps,
    activation: buildActivation(input.signups, input.reaches, input.now, windowDays),
    measurableFrom: input.measurableFrom
      ? input.measurableFrom.toISOString()
      : null,
  };
}

/**
 * Activation = a client link created within `windowDays` of signup.
 *
 * A reach *before* the signup timestamp is still counted: it can only come from
 * clock skew between two writes, and treating a link the user demonstrably
 * created as evidence they did not is worse than the second it is out by.
 */
function buildActivation(
  signups: FunnelSignup[],
  reaches: FunnelReach[],
  now: Date,
  windowDays: number,
): ActivationMetric {
  const windowMs = windowDays * DAY_MS;
  const closesBy = now.getTime() - windowMs;

  const sharedAt = new Map<string, number>();
  for (const reach of reaches) {
    if (reach.step !== 'share_created') continue;
    const at = reach.at.getTime();
    const seen = sharedAt.get(reach.userId);
    // Earliest wins: a user who shared on day 3 and again on day 40 activated.
    if (seen === undefined || at < seen) sharedAt.set(reach.userId, at);
  }

  const closed = signups.filter((s) => s.signedUpAt.getTime() <= closesBy);
  const activated = closed.filter((s) => {
    const at = sharedAt.get(s.userId);
    return at !== undefined && at <= s.signedUpAt.getTime() + windowMs;
  }).length;

  return {
    cohort: closed.length,
    activated,
    percent: percent(activated, closed.length),
    windowDays,
  };
}

/** Rounded 0..100 share; an empty denominator is 0, never NaN. */
function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
