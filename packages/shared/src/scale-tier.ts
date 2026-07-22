/**
 * Scale tier — how big is this project, actually, according to the client?
 *
 * Every design agent had the same blind spot: nothing in the pipeline ever
 * *decided* how large a system it was designing. The architect's prompt said
 * "pick the simplest architecture", but only about architecture STYLE (monolith
 * vs microservices) — it said nothing about infrastructure, and its own schema
 * line enumerated `cache, queue` among the example layers, which reads to a model
 * as a checklist. So a project the client described as "a lightweight task and
 * reminder board for small teams", with 30–50 users at launch and 300–400 after
 * six months, came back with Redis, BullMQ, a Vercel + AWS RDS hybrid, an audit
 * log table, and multi-field filtering on all six entities.
 *
 * None of that is wrong for a real enterprise SaaS. That is exactly the problem:
 * with no stated tier, a model falls back on what a professional SaaS "usually"
 * has, which is the largest system in its training data. The client is then
 * quoted hosting cost, operational complexity, and build time their own stated
 * size contradicts.
 *
 * **The tier is decided by CODE, not by the model.** That is the whole point, and
 * it follows the precedent set by the roadmap's week numbers and the review's
 * `overallScore`: a number the model supplies is a claim, while a number the code
 * derives is auditable. The model is *told* which tier it is designing for and
 * must design to it; `scaleTierRationale` states the evidence in the artifact so
 * an owner can check the tier against the numbers themselves.
 *
 * Calibration runs in BOTH directions. This is not a "keep it simple" switch —
 * a stated 50,000 users, a multi-branch enterprise, or a compliance regime moves
 * the tier up and the queue/cache guidance with it.
 *
 * Pure and runtime-free.
 */

import {
  copyFor,
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
  type LocalizedCopy,
} from './artifact-language';
import { normalizeDigits, parseBudget, parseTimelineWeeks } from './effort';

/**
 * How much system this project actually needs.
 *
 * Three tiers rather than a continuum because the decision they drive is
 * genuinely discrete: at `small` a queue is unjustified, at `medium` it is
 * justified per-feature, at `large` it is expected. A finer scale would imply a
 * precision the inputs (a sentence about expected users) do not carry.
 */
export type ScaleTier = 'small' | 'medium' | 'large';

export const SCALE_TIERS: readonly ScaleTier[] = ['small', 'medium', 'large'];

export function isScaleTier(value: unknown): value is ScaleTier {
  return typeof value === 'string' && (SCALE_TIERS as readonly string[]).includes(value);
}

/**
 * Below this many users a system is `small`: one process, one managed database,
 * synchronous request handling. 1,000 rather than a rounder 100 because the gap
 * between "a few hundred" and "a few thousand" is where a single instance stops
 * comfortably absorbing peaks.
 */
export const SMALL_USER_CEILING = 1_000;

/**
 * At or above this many users a system is `large`. 10,000 matches the figure the
 * architect's existing `LARGE_SCALE` pattern already treated as a large-scale
 * signal, so the two cannot disagree about the same sentence.
 */
export const LARGE_USER_FLOOR = 10_000;

/** A budget at or under this reads as a signal against heavy infrastructure. */
export const SMALL_BUDGET_USD = 15_000;

/** A budget at or above this can genuinely carry managed infrastructure. */
export const LARGE_BUDGET_USD = 100_000;

/** A timeline at or under this many weeks is a signal against heavy infrastructure. */
export const SHORT_TIMELINE_WEEKS = 8;

/** A timeline at or over this many weeks can absorb heavier infrastructure work. */
export const LONG_TIMELINE_WEEKS = 26;

/** One piece of evidence behind the tier, in the client's own terms. */
export interface ScaleSignal {
  /** Which input this came from. */
  source: 'users' | 'budget' | 'timeline' | 'language';
  /** Which way it pushes the tier. */
  direction: 'down' | 'up';
  /** The localized clause key naming this evidence. */
  key: ScaleSignalKey;
  /** The figure behind it, when there is one (users, dollars, weeks). */
  value?: number;
}

export type ScaleSignalKey =
  | 'usersFew'
  | 'usersMany'
  | 'budgetTight'
  | 'budgetLarge'
  | 'timelineShort'
  | 'timelineLong'
  | 'languageSimple'
  | 'languageEnterprise';

export interface ScaleAssessment {
  tier: ScaleTier;
  /** Every signal read, in the order they were weighed. */
  signals: ScaleSignal[];
  /** The largest user count stated anywhere, or null when none was stated. */
  statedUsers: number | null;
  /**
   * True when NOTHING in the inputs speaks to scale.
   *
   * The tier is then `medium` — deliberately the middle, never an extreme. A
   * guessed `small` could under-build a genuine enterprise deal; a guessed
   * `large` is the over-engineering this module exists to stop. `medium` is also
   * exactly the right *behaviour* when scale is unknown: introduce a queue or a
   * cache for the specific feature that needs one, not as a blanket default.
   */
  unstated: boolean;
}

/** What the assessment reads. Every field is optional — none is guaranteed. */
export interface ScaleInput {
  /** The `scale_expectations` slot — the client's own words about volume. */
  scaleText?: string | null;
  /** The `budget_range` slot. */
  budgetText?: string | null;
  /** The `timeline` slot. */
  timelineText?: string | null;
  /**
   * Free prose describing the product: the idea, the executive summary, the
   * functional and non-functional requirements. Self-description language
   * ("lightweight", "for small teams", "enterprise", "multi-branch") lives here.
   */
  descriptionText?: string | null;
}

// ── self-description language ───────────────────────────────────────────────

/*
 * Two vocabularies, English and Arabic. The Arabic halves carry no `\b`:
 * JavaScript's word boundary is ASCII-only and never fires next to Arabic
 * script, so an anchored Arabic pattern silently matches nothing — the same trap
 * `stripMetrics` shipped with.
 */

const SMALL_LANGUAGE_EN =
  /\b(?:simple|lightweight|light[- ]?weight|minimal|barebones|no[- ]?frills|basic|small team|small teams|small business|handful of|internal tool|side project|prototype|pilot|proof of concept|poc|mvp|starter)\b/i;

const SMALL_LANGUAGE_AR =
  /(?:بسيط|بسيطة|خفيف|خفيفة|مبسط|مبسطة|أولي|أولية|تجريبي|تجريبية|فريق صغير|فرق صغيرة|شركة صغيرة|أداة داخلية|نموذج أولي|الحد الأدنى)/;

const ENTERPRISE_LANGUAGE_EN =
  /\b(?:enterprise|multi[- ]?branch|multi[- ]?region|multi[- ]?tenant|multi[- ]?national|high[- ]?availability|highly available|mission[- ]?critical|nationwide|country[- ]?wide|worldwide|global|failover|disaster recovery|\bsla\b|regulated|audit trail|millions?|large[- ]?scale|high[- ]?traffic|high[- ]?volume|peak load|24\/7)\b/i;

const ENTERPRISE_LANGUAGE_AR =
  /(?:مؤسسي|مؤسسية|متعدد الفروع|متعددة الفروع|متعدد المناطق|عالي التوافر|عالية التوافر|بالغ الأهمية|على مستوى الدولة|على مستوى المملكة|عالمي|عالمية|تعافي من الكوارث|اتفاقية مستوى الخدمة|خاضع للتنظيم|ملايين|حجم كبير|حركة عالية)/;

function describesSmall(text: string): boolean {
  return SMALL_LANGUAGE_EN.test(text) || SMALL_LANGUAGE_AR.test(text);
}

function describesEnterprise(text: string): boolean {
  return ENTERPRISE_LANGUAGE_EN.test(text) || ENTERPRISE_LANGUAGE_AR.test(text);
}

// ── stated user counts ──────────────────────────────────────────────────────

/**
 * Nouns that make a nearby number a count of PEOPLE.
 *
 * The noun is required — a bare number in a scale sentence is as likely to be a
 * price, a record count, or a year. `parseBudget`'s "null, never a guess" rule
 * applied to volume: an unreadable figure yields no signal rather than a wrong
 * one.
 */
const USER_NOUNS =
  '(?:users?|accounts?|customers?|clients?|members?|employees?|staff|people|seats?|subscribers?|' +
  // Domain words for the same thing. A health platform states its size in
  // patients and a school in students; without these the classifier read
  // "60,000 registered patients, 4,000 concurrent users" as a 4,000-user system
  // — the large scenario silently reading an order of magnitude small.
  'patients?|students?|pupils?|visitors?|guests?|residents?|drivers?|riders?|merchants?|vendors?|' +
  'مستخدم|مستخدمين|مستخدمًا|عميل|عملاء|موظف|موظفين|مشترك|مشتركين|أعضاء|عضو|مريض|مرضى|طالب|طلاب|زائر|زوار)';

/**
 * "400 active users", "10k concurrent users", "50 مستخدم".
 *
 * The words allowed between the figure and its noun are `[^\s\d]+` — **not**
 * `\w+`, and the exclusion of digits is load-bearing. With `\w+`, scanning
 * *"40 clinics, 60,000 registered patients"* anchored on `40`, let the gap span
 * `clinics 60000 registered`, and matched `patients` — so the match captured
 * **40**, consumed the 60,000, and the whole enterprise scenario read as a
 * 4,000-user system. Excluding digits stops one figure's match from swallowing
 * another. (`\w` is also ASCII-only, so the gap never spanned an Arabic word.)
 */
const USERS_AFTER = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*([km])?\\s*\\+?\\s*(?:[^\\s\\d]+\\s+){0,3}?${USER_NOUNS}`,
  'gi',
);

/**
 * "users: 500", "عدد المستخدمين حتى 500" — the figure trailing its noun.
 *
 * The separator is **required**, and `-`/`–` are deliberately not separators.
 * With the separator optional this matched a bare number anywhere after a
 * person-noun, so *"serving customers since 2019"* yielded **2019 users** and
 * the entire design was then sized from a year — a fabricated figure, which is
 * exactly what `parseBudget`'s "null, never a guess" rule exists to prevent. A
 * dash was equally bad: *"active users - 6 months"* read as 6 users. The
 * noun-first form (`USERS_AFTER`) still covers "4,000 concurrent users".
 */
const USERS_BEFORE = new RegExp(
  `${USER_NOUNS}\\s*(?:count|number|[:=]|إلى|حتى)\\s*(\\d+(?:\\.\\d+)?)\\s*([km])?`,
  'gi',
);

/**
 * The largest user count stated anywhere in the text, or null.
 *
 * The **largest** because a growth statement ("30–50 at launch, 300–400 after
 * six months") is a statement about what the system must eventually carry, and
 * designing to the launch figure would under-build on purpose. It is still a
 * modest number in the reported case, which is the point — the bug was never
 * that the tool read the wrong figure, it was that it read none.
 */
export function statedUserCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const normalized = normalizeDigits(text).replace(/,/g, '');
  let best: number | null = null;
  for (const re of [USERS_AFTER, USERS_BEFORE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) !== null) {
      let n = parseFloat(match[1]);
      if (!Number.isFinite(n)) continue;
      const suffix = match[2]?.toLowerCase();
      if (suffix === 'k') n *= 1_000;
      else if (suffix === 'm') n *= 1_000_000;
      if (n < 1) continue;
      best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

// ── the assessment ──────────────────────────────────────────────────────────

/** The larger of two optional figures; null only when both are null. */
function maxOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

const TIER_INDEX: Record<ScaleTier, number> = { small: 0, medium: 1, large: 2 };

function tierAt(index: number): ScaleTier {
  return SCALE_TIERS[Math.max(0, Math.min(SCALE_TIERS.length - 1, index))];
}

/**
 * Read the scale signals and pick a tier.
 *
 * Two stages, and the order matters: **a stated number sets the base tier**, and
 * everything else may then adjust it by at most **one step**. A client who says
 * "50,000 users" has told us more than an adjective has, so no amount of
 * "lightweight" talk can drag that design down two tiers into a single instance;
 * equally, "enterprise-grade" phrasing over 300 stated users cannot conjure a
 * multi-region deployment. The clamp is what keeps this a calibration rather than
 * a vibe.
 *
 * With no number at all the base is `medium` — see `ScaleAssessment.unstated`.
 */
export function assessScaleTier(input: ScaleInput): ScaleAssessment {
  const description = `${input.descriptionText ?? ''}`;
  // The scale slot is read for BOTH a figure and its wording, so "a few small
  // teams" counts as language even when it carries no number.
  const languageHaystack = `${description} ${input.scaleText ?? ''}`;
  // The LARGEST across BOTH sources, not the first that yields anything. With
  // `??`, a scale slot stating only the launch figure ("30-50 users at launch")
  // stopped the search before the requirement prose ("must support 4,000
  // concurrent users at peak") was ever read — sizing the design to 50 and
  // under-building, which is the direction this module exists to avoid.
  const statedUsers = maxOf(
    statedUserCount(input.scaleText),
    statedUserCount(description),
  );

  const signals: ScaleSignal[] = [];

  let base: number;
  if (statedUsers === null) {
    base = TIER_INDEX.medium;
  } else if (statedUsers < SMALL_USER_CEILING) {
    base = TIER_INDEX.small;
    signals.push({ source: 'users', direction: 'down', key: 'usersFew', value: statedUsers });
  } else if (statedUsers < LARGE_USER_FLOOR) {
    base = TIER_INDEX.medium;
    signals.push({ source: 'users', direction: 'up', key: 'usersMany', value: statedUsers });
  } else {
    base = TIER_INDEX.large;
    signals.push({ source: 'users', direction: 'up', key: 'usersMany', value: statedUsers });
  }

  const budget = parseBudget(input.budgetText);
  if (budget && budget.max <= SMALL_BUDGET_USD) {
    signals.push({ source: 'budget', direction: 'down', key: 'budgetTight', value: budget.max });
  } else if (budget && budget.max >= LARGE_BUDGET_USD) {
    signals.push({ source: 'budget', direction: 'up', key: 'budgetLarge', value: budget.max });
  }

  const weeks = parseTimelineWeeks(input.timelineText);
  if (weeks !== null && weeks <= SHORT_TIMELINE_WEEKS) {
    signals.push({ source: 'timeline', direction: 'down', key: 'timelineShort', value: weeks });
  } else if (weeks !== null && weeks >= LONG_TIMELINE_WEEKS) {
    signals.push({ source: 'timeline', direction: 'up', key: 'timelineLong', value: weeks });
  }

  // Language is read last and weighed like any other signal — an adjective is
  // evidence, but weaker than a figure, which the ±1 clamp below encodes.
  if (describesEnterprise(languageHaystack)) {
    signals.push({ source: 'language', direction: 'up', key: 'languageEnterprise' });
  } else if (describesSmall(languageHaystack)) {
    signals.push({ source: 'language', direction: 'down', key: 'languageSimple' });
  }

  const adjustable = signals.filter((s) => s.source !== 'users');
  const net = adjustable.reduce((sum, s) => sum + (s.direction === 'up' ? 1 : -1), 0);
  const adjust = Math.sign(net);

  return {
    tier: tierAt(base + adjust),
    signals,
    statedUsers,
    unstated: signals.length === 0,
  };
}

// ── prompt guidance (English — prompts are always English) ───────────────────

/**
 * The infrastructure budget for a tier, as prompt lines.
 *
 * English regardless of the artifact language: this is an instruction TO the
 * model, not prose the client reads. `outputLanguageRules` is what decides the
 * language the model answers in.
 *
 * The `small` entry is the one that fixes the reported bug, and it is phrased as
 * a prohibition with a named escape hatch rather than a preference — "prefer
 * simple" is what the prompt already said, and it lost to the model's priors.
 */
const TIER_INFRASTRUCTURE_RULES: Record<ScaleTier, readonly string[]> = {
  small: [
    'INFRASTRUCTURE BUDGET (Small/MVP tier): one application process and one',
    'managed relational database, on ONE affordable managed host. Handle requests',
    'synchronously.',
    'Do NOT include a cache (Redis, Memcached) or a job queue (BullMQ, SQS,',
    'Celery, Sidekiq) in techStack. A scheduled reminder or a transactional email',
    'at this volume is a direct call or a simple scheduled function — it does not',
    'need a queue, and adding one bills the client for a service they will not use.',
    'The ONLY exception: a specific functional or non-functional requirement that',
    'genuinely cannot be served synchronously (a long-running import or export,',
    'video/image processing, a third-party rate limit, a stated hard latency',
    'budget). If you take that exception, the techStack rationale MUST quote the',
    'requirement that forces it.',
    'Do not split hosting across providers — one host for the app and its database',
    'unless a stated constraint forbids it.',
  ],
  medium: [
    'INFRASTRUCTURE BUDGET (Medium tier): a single deployable application and a',
    'managed database remain the default.',
    'Add a cache or a queue ONLY for the specific feature that needs one, and name',
    'that feature in the rationale — never as a blanket platform default. A cache',
    'added "for performance" with no named hot path is unjustified spend.',
  ],
  large: [
    'INFRASTRUCTURE BUDGET (Large/Enterprise tier): the stated scale justifies',
    'managed infrastructure — caching, a job queue, background workers, read',
    'replicas and horizontal scaling are appropriate where the load, availability',
    'or compliance requirements call for them. Still tie each one to the driver',
    'that justifies it rather than listing it as standard equipment.',
  ],
};

/**
 * The OPERATIONS budget for a tier — what the team must run, pay for and keep
 * alive after launch, as opposed to what the system is built from.
 *
 * This is the second half of the same decision, and it exists because the first
 * half was applied in exactly one place. `TIER_INFRASTRUCTURE_RULES` sized the
 * *architecture* and lived only in the System Architect's prompt, so a project
 * correctly designed as one process on one managed host was then handed a
 * roadmap whose Hardening phase said "Integrate Prometheus metrics" and "Send
 * logs to an ELK stack" — a full observability platform for a five-figure MVP,
 * bolted onto a design that had just been stripped of a cache it could not
 * justify. The roadmap was not disagreeing with the design; nobody had ever told
 * it there was a tier at all, so it fell back on the same prior the architect
 * used to fall back on.
 *
 * Every downstream stage that recommends tooling or operational practice reads
 * this table, keyed by the tier stamped on the system design — so the roadmap,
 * the QA plan, the threat model and the review cannot size the same project
 * differently from each other or from the architecture.
 *
 * Calibration runs in both directions, like the tier itself: `large` states
 * plainly that a dedicated observability stack is the right answer there. The
 * rule is proportionality, never a ban on particular products.
 */
const TIER_OPERATIONS_RULES: Record<ScaleTier, readonly string[]> = {
  small: [
    'OPERATIONS BUDGET (Small/MVP tier): there is no dedicated DevOps capacity',
    'here. Every operational tool is one more thing this team installs, pays for',
    'and keeps alive, and at this scale that cost is not repaid.',
    'Use what the chosen host already gives you: its built-in log stream, its',
    'uptime/health check and its metrics page. The observability plan at this',
    'tier is structured (JSON) application logs, a /health endpoint the host can',
    'poll, and error alerting — nothing more.',
    'Do NOT introduce a dedicated observability stack (a metrics server, a',
    'log-aggregation cluster, a tracing backend, an APM subscription), a',
    'dedicated security product (WAF, SIEM, intrusion detection), container',
    'orchestration or a service mesh, or a multi-region/failover deployment.',
    'Standard practice covers the risk at this scale: rate limiting via framework',
    'middleware, input validation, enforced HTTPS, dependency auditing in CI, and',
    'the managed backups the database provider already takes.',
    'The ONLY exception is a stated requirement that plainly demands more — a',
    'contractual uptime or availability target, a regulatory audit or retention',
    'obligation, a named certification. If you take that exception, name the',
    'requirement that forces it.',
  ],
  medium: [
    'OPERATIONS BUDGET (Medium tier): host-provided logging and uptime checks',
    'remain the baseline.',
    'Add a dedicated monitoring, logging or tracing service only for the specific',
    'component whose failure or latency the team genuinely cannot diagnose',
    'without it, and name that component. A monitoring stack adopted "for',
    'observability" with no component named is unjustified spend and unowned',
    'operational work.',
  ],
  large: [
    'OPERATIONS BUDGET (Large/Enterprise tier): the stated scale justifies real',
    'operational tooling — a full observability stack (metrics, centralized log',
    'aggregation, distributed tracing), dedicated security tooling, load and',
    'resilience testing, and multi-region or failover deployment are appropriate',
    'where availability, compliance or load calls for them. Still tie each one to',
    'the driver that justifies it rather than listing it as standard equipment.',
  ],
};

/**
 * The scale-tier block for a DOWNSTREAM prompt — the roadmap, QA plan, threat
 * model and review.
 *
 * It takes the tier off the finished system design rather than re-deriving it,
 * which is the whole point: one assessment of one set of numbers sizes the
 * architecture, the plan to build it, the plan to test it and the review of it.
 * A stage that re-assessed scale from the same inputs would be a second opinion
 * that can drift, and the drift is invisible — each artifact reads plausibly on
 * its own, and only a reader holding two of them at once sees the contradiction.
 *
 * The grounding differs from `scaleTierPromptBlock` on purpose. The architect is
 * shown the evidence because it is deciding; these stages are shown the design
 * itself, so the check they are pointed at is one they can actually run — the
 * infrastructure in front of them either has a cache and a queue or it does not.
 *
 * An **absent tier returns the empty string**, which means the previous
 * behaviour. Designs generated before the tier existed carry none, and guessing
 * one here would size a plan from an assessment nobody made — the same rule as
 * an unstamped `sourceStamp` never reading as stale.
 */
export function scaleOperationsPromptBlock(tier: ScaleTier | undefined): string {
  if (!tier) return '';
  return [
    `SCALE TIER: ${tier.toUpperCase()}. This was decided from the client's own` +
      ' stated figures and the system design above was already sized to it. Use this' +
      ' tier — do not re-estimate the size of the project, and do not recommend',
    'operational tooling the design itself does not run.',
    ...TIER_OPERATIONS_RULES[tier],
  ].join('\n');
}

/**
 * The full scale-tier block for a design prompt: the verdict, the evidence the
 * code actually read, and the infrastructure budget that follows from it.
 *
 * The evidence is included so the model can see the tier is a reading of the
 * client's own numbers rather than an arbitrary label handed down — a model told
 * only "you are at the small tier" will second-guess it against its priors.
 */
export function scaleTierPromptBlock(assessment: ScaleAssessment): string {
  const lines = [
    `SCALE TIER (decided from the client's stated figures — design to it): ${assessment.tier.toUpperCase()}`,
    `Evidence: ${scaleEvidenceSummary(assessment)}`,
    ...TIER_INFRASTRUCTURE_RULES[assessment.tier],
  ];
  return lines.join('\n');
}

/**
 * The evidence line, in English, for prompts and logs.
 *
 * It reads the **English entry of the one localized clause table** rather than a
 * second English table of its own. There used to be two, and the compiler
 * enforced exhaustiveness on each independently — so adding a signal key or
 * rewording a clause in one left the other silently describing the same evidence
 * differently, with nothing failing.
 */
export function scaleEvidenceSummary(assessment: ScaleAssessment): string {
  if (assessment.unstated) {
    return 'no scale figures, budget or timeline were stated; defaulting to the middle tier rather than assuming either extreme';
  }
  return assessment.signals.map((s) => renderClause(s, 'en')).join('; ');
}

function renderClause(signal: ScaleSignal, language: ArtifactLanguage): string {
  const clause = copyFor(SIGNAL_CLAUSES, language)[signal.key];
  return clause.replace('{n}', formatCount(signal.value ?? 0));
}

function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// ── client-facing rationale (localized) ─────────────────────────────────────

/**
 * The tier's display name, in the artifact's language.
 *
 * `LocalizedCopy` is the mechanism: a table that forgets a language will not
 * compile, so this can never ship half-translated.
 */
const TIER_NAMES: LocalizedCopy<Record<ScaleTier, string>> = {
  en: { small: 'Small / MVP', medium: 'Medium', large: 'Large / Enterprise' },
  ar: { small: 'صغير / الحد الأدنى', medium: 'متوسط', large: 'كبير / مؤسسي' },
};

/**
 * One evidence clause per signal, and the single source for both the prompt's
 * English evidence line and the client-facing rationale.
 *
 * `{n}` is the only interpolation, and it is a NUMBER — never a fragment of
 * client prose. Splicing the client's own words into a fixed sentence is the
 * broken-grammar class this codebase fixed once already (`Confirm ${c.name} is a
 * real competitor…` read as neither language once the analyst answered in
 * Arabic), so every clause here is a whole sentence in its own language with a
 * numeral dropped into it.
 *
 * **Budget and timeline are qualitative; only the user count carries a figure.**
 * That is R7/R8's rule, and it binds here specifically because this rationale is
 * stored on the design and `ShareService.view` passes the system design through
 * to the **public client-facing page**. The timeline clause used to read "a
 * 6-week delivery window", which restated the exact date the architect's own
 * prompt forbids it to restate. Scale MAY be named — the client stated it and
 * the whole point of the line is that they can audit the tier against it.
 */
const SIGNAL_CLAUSES: LocalizedCopy<Record<ScaleSignalKey, string>> = {
  en: {
    usersFew: '{n} expected users',
    usersMany: '{n} expected users',
    budgetTight: 'a limited budget',
    budgetLarge: 'a budget that supports managed infrastructure',
    timelineShort: 'a short delivery window',
    timelineLong: 'a long delivery window',
    languageSimple: 'a product the client describes as simple and lightweight',
    languageEnterprise: 'enterprise-scale needs stated by the client',
  },
  ar: {
    usersFew: '{n} مستخدم متوقع',
    usersMany: '{n} مستخدم متوقع',
    budgetTight: 'ميزانية محدودة',
    budgetLarge: 'ميزانية تتحمل بنية تحتية مُدارة',
    timelineShort: 'مدة تسليم قصيرة',
    timelineLong: 'مدة تسليم طويلة',
    languageSimple: 'منتج يصفه العميل بأنه بسيط وخفيف',
    languageEnterprise: 'احتياجات على نطاق مؤسسي ذكرها العميل',
  },
};

const RATIONALE_TEMPLATE: LocalizedCopy<{
  stated: string;
  unstated: string;
  separator: string;
}> = {
  en: {
    stated: 'Scale tier: {tier} — {evidence}. The infrastructure below is sized to that.',
    unstated:
      'Scale tier: {tier} — no expected volume, budget or timeline was stated, so the middle tier is used rather than assuming either extreme. Confirm the expected scale with the client before committing to infrastructure.',
    separator: ', ',
  },
  ar: {
    stated: 'مستوى الحجم: {tier} — {evidence}. البنية التحتية أدناه مُحجَّمة على هذا الأساس.',
    unstated:
      'مستوى الحجم: {tier} — لم يُذكر حجم متوقع ولا ميزانية ولا جدول زمني، لذلك اعتُمد المستوى المتوسط بدل افتراض أحد الطرفين. يُرجى تأكيد الحجم المتوقع مع العميل قبل الالتزام بالبنية التحتية.',
    separator: '، ',
  },
};

/**
 * The client-facing "why this tier" line stored on the design.
 *
 * Written by code rather than by the model, deliberately: the point of showing
 * the tier is that an owner can audit whether the numbers were actually read, and
 * a model-written rationale would be exactly the unverifiable claim this replaces.
 */
export function scaleTierRationale(
  assessment: ScaleAssessment,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): string {
  const template = copyFor(RATIONALE_TEMPLATE, language);
  const tier = copyFor(TIER_NAMES, language)[assessment.tier];
  if (assessment.unstated) return template.unstated.replace('{tier}', tier);

  const evidence = assessment.signals
    .map((s) => renderClause(s, language))
    .join(template.separator);
  return template.stated.replace('{tier}', tier).replace('{evidence}', evidence);
}

// ── the code backstop ───────────────────────────────────────────────────────

/** Tech-stack layers/technologies that are a cache. */
const CACHE_TECH = /\b(?:redis|memcached|valkey|elasticache|dragonfly|hazelcast)\b/i;

/** Tech-stack layers/technologies that are a job queue or background worker. */
const QUEUE_TECH =
  /\b(?:bullmq|bull|sidekiq|celery|rabbitmq|kafka|sqs|pub\/?sub|resque|agenda|bee-queue|temporal|inngest)\b/i;

const CACHE_LAYER = /^(?:cache|caching|cdn cache|in-memory cache)$/i;
const QUEUE_LAYER = /^(?:queue|queueing|jobs?|job queue|worker|workers|background jobs?|messaging|message broker|event bus)$/i;

/**
 * Layers a design cannot function without — never removed, whatever they name.
 *
 * Without this guard the technology match below reaches straight through a
 * layer's role: a perfectly ordinary `{layer:'backend', technology:'NestJS +
 * BullMQ'}` matches `QUEUE_TECH` and the whole **backend** row is deleted, and
 * `{layer:'database', technology:'Redis'}` deletes the design's only datastore.
 * A backstop meant to remove one unjustified line must not be able to remove the
 * system.
 */
const CORE_LAYER =
  /^(?:backend|api|server|frontend|web|client|mobile|database|db|datastore|storage|auth|authentication|identity|hosting|host|infrastructure|deployment|cdn)$/i;

/**
 * Requirements that genuinely need work to happen off the request thread.
 *
 * Deliberately narrow. "Send a notification" is NOT here — that is the exact
 * feature that justified BullMQ + Redis for 400 users, and at that volume it is a
 * direct call or a scheduled function. What survives is work that is *long* or
 * *externally rate-limited*, where a synchronous request would genuinely time out.
 *
 * Two entries were narrowed after they proved to fire on ordinary prose and
 * switch the whole backstop off: a bare `rate[- ]?limit\w*` matched the
 * boilerplate NFR *"the API must rate-limit requests to prevent abuse"* — which
 * is about limiting **our** callers, not about waiting on somebody else — and a
 * bare `migrat\w*` matched "database migrations". Both now require the external
 * party or the data volume that actually implies asynchronous work.
 */
const ASYNC_JUSTIFICATION =
  /\b(?:bulk|batch|import|export|transcod\w*|video process\w*|image process\w*|thumbnail|ocr|machine learning|ml (?:model|inference)|large (?:file|dataset)|nightly|long[- ]?running|throughput of|jobs? per (?:second|minute)|webhook retr\w*|streaming ingest\w*|data migration|legacy (?:data|system) migration)\b|\b(?:third[- ]?party|external|upstream|provider|vendor|partner)\b[^.]{0,40}\brate[- ]?limit/i;

const ASYNC_JUSTIFICATION_AR =
  /(?:استيراد|تصدير|معالجة الفيديو|معالجة الصور|دفعات|عملية طويلة|ترحيل البيانات)/;

/** Does anything in the requirements genuinely force asynchronous processing? */
export function needsAsyncProcessing(requirementText: string): boolean {
  return (
    ASYNC_JUSTIFICATION.test(requirementText) ||
    ASYNC_JUSTIFICATION_AR.test(requirementText)
  );
}

export interface StackScaleResult {
  techStack: TechChoiceLike[];
  /** Technologies removed, for the log line. Empty when nothing was dropped. */
  removed: string[];
}

/**
 * The shape this backstop needs from a tech choice.
 *
 * Structural rather than an import of `TechChoice`, because `system-design.ts`
 * imports `ScaleTier` from here — a type-only import erases at runtime, so the
 * cycle would be harmless, but keeping the dependency one-way means this module
 * stays importable from anywhere without thinking about it.
 */
export interface TechChoiceLike {
  layer: string;
  technology: string;
  rationale: string;
}

/**
 * Strip cache/queue infrastructure a small-tier design has no justification for.
 *
 * The prompt is the primary defence and this is the backstop — the standing
 * division of labour here, the same shape as `applyTenancy` and
 * `enforcePaymentAvailability`. It exists because an emphatic prompt rule with
 * no code behind it is exactly what failed: "pick the simplest architecture"
 * was already in the architect's prompt while it was recommending Redis.
 *
 * **Asymmetric on purpose, like `applyTenancy` and for the mirrored reason.**
 * It only ever REMOVES, and only at the small tier. Removing a queue from a
 * genuinely large system would be a correctness failure the client feels under
 * load, so nothing here touches medium or large. Leaving an unjustified queue on
 * a 400-user tool costs money every month and is invisible until the bill
 * arrives — so that direction is enforced in code.
 *
 * A design that names a real async requirement keeps its queue: the escape hatch
 * in the prompt and the escape hatch in the backstop are the same test, so the
 * two can never disagree.
 */
// ── the operations backstop ─────────────────────────────────────────────────

/*
 * Three narrow patterns, and the narrowness is the design. Each names a
 * *platform the team would have to run*, never a practice and never a technique
 * — the calibration is about who operates what, not about which words appear.
 *
 * Deliberately absent, and each for a reason:
 *  - **Sentry, and hosted error tracking generally.** One environment variable
 *    and a free tier. That is exactly the "lightweight hosted tier" a small-tier
 *    project should have, so flagging it would strip the one piece of
 *    observability this tier is supposed to keep.
 *  - **Bare `elasticsearch`.** Roadmap tasks span every phase, and a Supporting
 *    Features task that indexes products for search is not an operations
 *    recommendation. `logstash`/`kibana`/`elk stack` carry the logging meaning on
 *    their own, so the ambiguous token buys nothing and costs a real task.
 *  - **`ids` / `ips` as abbreviations.** They match "ids" in ordinary prose.
 *  - **Dependency scanners (Snyk, `npm audit`) and CI security steps.** The
 *    small-tier rules name dependency auditing as standard practice, so a
 *    backstop that removed it would contradict the prompt it backs up.
 *  - **Load-testing tools.** A performance check against one list endpoint is
 *    proportionate at any tier; only a load-testing *programme* is not, and no
 *    regex can tell those apart. The QA planner sizes that one in code instead.
 */

/** Observability platforms — something to deploy and keep alive, not a log line. */
const OBSERVABILITY_PLATFORM =
  /\b(?:prometheus|grafana|loki|thanos|mimir|cortex|elk stack|\belk\b|logstash|kibana|graylog|fluentd|fluent ?bit|datadog|new relic|dynatrace|appdynamics|splunk|sumo ?logic|jaeger|zipkin|signoz|victoriametrics|nagios|zabbix|opentelemetry collector|otel collector)\b/i;

/** Security products bought and operated, as opposed to controls written in code. */
const SECURITY_PLATFORM =
  /\b(?:waf|web application firewall|siem|soar|intrusion detection|intrusion prevention|hashicorp vault|crowdstrike|wazuh|falco|qualys|nessus|tenable|imperva|aws shield|guardduty|security hub)\b/i;

/** Deployment topologies a one-process, one-host budget cannot carry. */
const HEAVY_PLATFORM =
  /\b(?:kubernetes|k8s|service mesh|istio|linkerd|multi[- ]?region|cross[- ]?region|active[- ]active|active[- ]passive|failover cluster|disaster[- ]recovery site|read replicas?)\b/i;

/**
 * Requirements that justify dedicated operational tooling even at the small tier.
 *
 * This is the SAME escape hatch the small-tier prompt rules state, expressed as
 * code, exactly as `needsAsyncProcessing` mirrors the infrastructure prompt's
 * exception — so the instruction and the backstop can never disagree about when
 * heavier tooling is warranted.
 *
 * The Arabic half is not decoration. An English-only pattern over an Arabic
 * requirement document silently matches nothing, and here a silent miss means
 * the escape hatch never fires — so an Arabic project would be stripped harder
 * than an identical English one. That is the `stripMetrics` trap, and the same
 * rule applies: no `\b`, which is ASCII-only and never fires next to Arabic.
 */
const ASSURANCE_JUSTIFICATION =
  /\b(?:99\.9|99\.99|uptime (?:target|guarantee|commitment)|availability (?:target|guarantee|commitment)|\bsla\b|service[- ]level agreement|penetration test\w*|pci[- ]?dss|\bhipaa\b|\bsoc ?2\b|iso ?27001|regulatory audit|compliance audit|audit (?:log |trail )?retention|certification)\b/i;

const ASSURANCE_JUSTIFICATION_AR =
  /(?:اتفاقية مستوى الخدمة|مستوى الخدمة|هدف التوافر|نسبة التوافر|اختبار اختراق|تدقيق تنظيمي|شهادة امتثال|الاحتفاظ بالسجلات)/;

/**
 * Does anything in the requirements genuinely justify dedicated ops tooling?
 *
 * Exported for the same reason `needsAsyncProcessing` is: an agent that wants to
 * explain *why* it kept a heavier recommendation should ask the same question
 * the backstop asks, not a similar one.
 */
export function needsOperationalAssurance(requirementText: string): boolean {
  return (
    ASSURANCE_JUSTIFICATION.test(requirementText) ||
    ASSURANCE_JUSTIFICATION_AR.test(requirementText)
  );
}

/**
 * Is this one recommendation over-scaled for the tier?
 *
 * Only ever true at `small`, mirroring `enforceScaleAppropriateStack`'s
 * asymmetry and for the mirrored reason. Stripping a monitoring stack from a
 * genuinely large system is an outage nobody can diagnose; leaving one on a
 * 400-user tool is a monthly bill and unowned operational work that is invisible
 * until someone has to answer a page at 3am. Only the second direction is safe
 * to enforce in code, so only that one is.
 */
export function isOverScaledForTier(
  text: string,
  tier: ScaleTier | undefined,
  requirementText = '',
): boolean {
  if (tier !== 'small') return false;
  if (needsOperationalAssurance(requirementText)) return false;
  return (
    OBSERVABILITY_PLATFORM.test(text) ||
    SECURITY_PLATFORM.test(text) ||
    HEAVY_PLATFORM.test(text)
  );
}

export interface OperationsScaleResult {
  lines: string[];
  /** The recommendations dropped, for the log line. Empty when nothing was. */
  removed: string[];
}

/**
 * What "observability" actually means at the small tier, as a plan item.
 *
 * The backstop above deletes, and deletion alone is the wrong answer for a
 * *plan*: strip "Integrate Prometheus" and "Ship logs to ELK" from a Monitoring
 * & Logging milestone and the milestone empties, so a roadmap that over-scaled
 * observability is replaced by one with no observability at all. The milestone
 * was never the problem — its implementation was. So a caller left with nothing
 * puts this in its place instead of dropping the work.
 *
 * `LocalizedCopy` because this reaches the artifact on the **LLM path**, where
 * the roadmap is written in the project's language. An English line spliced into
 * an Arabic delivery plan is the half-translated artifact the language system
 * exists to prevent — and a table that forgets a language will not compile.
 */
export const SMALL_TIER_OPERATIONS_TASK: LocalizedCopy<{
  title: string;
  detail: string;
}> = {
  en: {
    title: 'Set up logging, health checks and error alerts on the host',
    detail:
      'Emit structured JSON application logs to the host’s built-in log stream, expose a /health endpoint for its uptime check, and route unhandled errors to an alerting address. No self-hosted monitoring stack is warranted at this scale.',
  },
  ar: {
    title: 'إعداد السجلات وفحوص السلامة وتنبيهات الأخطاء على الاستضافة',
    detail:
      'إصدار سجلات تطبيق منظَّمة بصيغة JSON إلى مسار السجلات المدمج في الاستضافة، وإتاحة نقطة /health لفحص التوافر، وتوجيه الأخطاء غير المعالَجة إلى عنوان للتنبيهات. لا تستدعي هذه المرحلة إنشاء منظومة مراقبة مستضافة ذاتيًا.',
  },
};

/**
 * Drop tooling recommendations a small-tier project has no justification for.
 *
 * For the plain string lists — the QA plan's `tooling`, the review's
 * `recommendations`. Removal-only, small-tier-only. Callers that would be left
 * with an empty list fall back to their own deterministic, tier-sized build
 * rather than shipping the section empty: the section is legitimate at every
 * tier, only its contents were over-scaled.
 */
export function enforceScaleAppropriateOperations(
  lines: readonly string[] | undefined,
  tier: ScaleTier | undefined,
  requirementText = '',
): OperationsScaleResult {
  const all = [...(lines ?? [])];
  if (tier !== 'small') return { lines: all, removed: [] };

  const removed: string[] = [];
  const kept = all.filter((line) => {
    if (!isOverScaledForTier(line, tier, requirementText)) return true;
    removed.push(line);
    return false;
  });
  return { lines: kept, removed };
}

export function enforceScaleAppropriateStack(
  techStack: readonly TechChoiceLike[] | undefined,
  tier: ScaleTier,
  requirementText: string,
): StackScaleResult {
  const stack = [...(techStack ?? [])];
  if (tier !== 'small') return { techStack: stack, removed: [] };
  if (needsAsyncProcessing(requirementText)) return { techStack: stack, removed: [] };

  const removed: string[] = [];
  const kept = stack.filter((choice) => {
    const layer = (choice.layer ?? '').trim();
    const tech = choice.technology ?? '';
    // A core layer is never removed, however it is spelled. The technology match
    // alone cannot tell "Redis, the cache" from "Redis, the only datastore" or
    // from "NestJS + BullMQ", where the queue is one clause of the backend row.
    if (CORE_LAYER.test(layer)) return true;
    const isCache = CACHE_LAYER.test(layer) || CACHE_TECH.test(tech);
    const isQueue = QUEUE_LAYER.test(layer) || QUEUE_TECH.test(tech);
    if (!isCache && !isQueue) return true;
    removed.push(tech || layer);
    return false;
  });

  return { techStack: kept, removed };
}
