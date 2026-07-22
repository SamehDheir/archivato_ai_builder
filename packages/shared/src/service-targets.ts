/**
 * Service targets — the numeric claims that appear in more than one artifact,
 * resolved **once** from the interview so every stage quotes the same figure.
 *
 * The bug this fixes, from a real run:
 *
 *   Vision page:        "SearchLatency — Average ≤1.5 seconds per query"
 *   System design page: "95% of dashboard/search <2s"
 *
 * Both describe one performance requirement and disagree, with nothing on either
 * page explaining why. The cause is not a broken sync mechanism — **there was no
 * shared figure to sync**. Each stage was asked for "measurable targets" and each
 * invented its own, and the Product Manager could not have reused the
 * requirement document's number because its context (`idea, industry, scale,
 * intent, summary`) never contained the requirement document, the NFRs, or even
 * the interview slots. The System Architect *does* receive the NFRs, which is
 * exactly why its figure tracked the requirement doc and the vision's did not.
 *
 * The fix is the pattern this codebase already uses for every other number that
 * must agree across artifacts — `estimateCosts`, `buildEffortEstimate`,
 * `assessScaleTier`: **a pure function of a shared source**. Two stages that both
 * call `resolveServiceTargets(slots)` cannot disagree, because neither is
 * deciding anything. That also means the vision does not have to wait for the
 * requirement document, which matters: the vision is a standalone stage that
 * only needs a confirmed interview and legitimately runs *before* requirements
 * exist, so threading the stored artifact into it would add an ordering
 * dependency and a staleness problem this has neither.
 *
 * Pure and runtime-free.
 */

import {
  copyFor,
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
  type LocalizedCopy,
} from './artifact-language';
import { normalizeDigits } from './effort';
import type { SlotMap } from './interview';

/** The figures that appear in more than one artifact. */
export type ServiceTargetKey =
  | 'latency'
  | 'uptime'
  | 'totalUsers'
  | 'concurrentUsers';

/**
 * Where a figure came from — and this is the field that makes the whole module
 * honest rather than merely consistent.
 *
 * `stated` is the client's own number. `proposed` is ours, invented because the
 * interview gave none — legitimate (a scoping document has to commit to
 * something) but it must be labelled, and above all it must be **proposed
 * exactly once** and then reused, never re-guessed per page. `derived` is
 * computed from another target by a stated rule, and it carries that rule with
 * it so a reader can check the arithmetic.
 */
export type TargetSource = 'stated' | 'proposed' | 'derived';

export interface ServiceTarget {
  key: ServiceTargetKey;
  /** The number itself, in `unit`. */
  value: number;
  unit: TargetUnit;
  source: TargetSource;
  /**
   * For a `derived` target, the rule that produced it, as an assumption a reader
   * can audit ("assuming 10% of registered users are active at peak"). Absent
   * for `stated` and `proposed`.
   */
  derivation?: string;
}

export type TargetUnit = 'seconds' | 'percent' | 'users';

export type ServiceTargets = Partial<Record<ServiceTargetKey, ServiceTarget>>;

/**
 * The share of registered users assumed to be active simultaneously at peak.
 *
 * This constant is the whole answer to the "1,000 users" bug. An interview
 * answer of *"Up to 1,000 users"* is a **total registered** count, and a later
 * stage rendered it as *"1,000 concurrent active users"* — a silently different
 * and far larger claim, since concurrency is what sizes the infrastructure. The
 * two are now separate keys with separate units, and the only path from one to
 * the other runs through this ratio and **records itself as an assumption**.
 *
 * 10% is a conventional planning figure for a business tool. It is deliberately
 * a named constant with one edit site, not a number inlined at a call site.
 */
export const CONCURRENT_USER_RATIO = 0.1;

/** Never propose a concurrency figure below this — a floor, not a rounding. */
const MIN_CONCURRENT_USERS = 5;

/**
 * The latency target proposed when the interview states none.
 *
 * A scoping document that says "fast" commits to nothing, so a number is better
 * than no number — provided it is the SAME number everywhere, which is what this
 * constant guarantees. 2 seconds is the conventional "feels responsive" bar for
 * an interactive page, and it is the figure the requirement document already
 * tended to land on when left to itself.
 */
export const DEFAULT_LATENCY_SECONDS = 2;

/** The uptime target proposed when the interview states none. */
export const DEFAULT_UPTIME_PERCENT = 99.5;

// ── parsing the client's own words ──────────────────────────────────────────

/** "under 2 seconds", "≤1.5s", "response time of 800ms", "خلال ٢ ثانية". */
const LATENCY_RE =
  /(?:\b(?:under|below|less than|within|at most|max(?:imum)?|≤|<=?)\s*)?(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s\b|secs?\b|seconds?|ثانية|ثوان|ثوانٍ|مللي)/i;

/** Words that make a nearby duration a *response*-time claim rather than any duration. */
const LATENCY_CONTEXT =
  /(?:latency|response time|load time|respond|loads?|render|search|query|page|request|round[- ]?trip|زمن الاستجابة|سرعة الاستجابة|تحميل)/i;

/**
 * "99.9% uptime", "99.5% availability", "توافر ٩٩٫٥٪".
 *
 * The percent sign is a character class because Arabic writes it `٪` (U+066A);
 * matching only `%` would have made this silently unreadable in exactly the
 * language half this product's clients write in — the `stripMetrics` trap.
 */
const UPTIME_RE =
  /(\d{2}(?:\.\d+)?)\s*[%٪]\s*(?:\w+\s+){0,2}?(?:uptime|availability|available|sla|توافر|إتاحة)|(?:uptime|availability|sla|توافر|إتاحة)\D{0,20}?(\d{2}(?:\.\d+)?)\s*[%٪]/i;

/**
 * Arabic decimal (`٫`) and thousands (`٬`) marks → their ASCII meaning.
 *
 * `normalizeDigits` converts the digits but not these, so `٩٩٫٥٪` became `99٫5`
 * and the fractional part was dropped — 99 where the client wrote 99.5.
 */
function normalizeSeparators(text: string): string {
  return normalizeDigits(text).replace(/٫/g, '.').replace(/٬/g, ',');
}

/**
 * Nouns that mark a user figure as CONCURRENT rather than total.
 *
 * The distinction is the point of this module: "concurrent" is a statement about
 * simultaneous sessions and sizes the infrastructure; "registered" is a statement
 * about the size of the customer base. Only an explicit concurrency word counts —
 * an unqualified "1,000 users" is a total, because that is what people mean.
 */
const CONCURRENT_MARKER =
  /(?:concurrent|simultaneous|at (?:the same time|once)|peak|parallel|متزامن|متزامنين|في نفس الوقت|ذروة)/i;

const USER_NOUN =
  /(?:users?|accounts?|customers?|clients?|members?|employees?|staff|seats?|subscribers?|patients?|students?|مستخدم|مستخدمين|مستخدمًا|عميل|عملاء|موظف|موظفين|مشترك|مشتركين)/i;

/**
 * A number attached to a user noun, with up to three words between them.
 *
 * The gap excludes digits (`[^\s\d]+`) for the reason `statedUserCount` records:
 * with `\w+` a match anchored on one figure can span and swallow a larger one.
 */
const USER_FIGURE_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*([km])?\\s*\\+?\\s*((?:[^\\s\\d]+\\s+){0,3}?)${USER_NOUN.source}`,
  'gi',
);

function toNumber(raw: string, suffix?: string): number | null {
  let n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  const s = suffix?.toLowerCase();
  if (s === 'k') n *= 1_000;
  else if (s === 'm') n *= 1_000_000;
  return n;
}

/**
 * Read a latency claim, normalized to seconds.
 *
 * Requires a response-time context word nearby. Without it, "within 6 weeks" and
 * "3 seconds" from an unrelated sentence would both read as latency targets —
 * the `parseBudget` "null, never a guess" rule applied to durations.
 */
export function parseLatencySeconds(text: string | null | undefined): number | null {
  if (!text) return null;
  const normalized = normalizeSeparators(text);
  for (const sentence of splitSentences(normalized)) {
    if (!LATENCY_CONTEXT.test(sentence)) continue;
    const match = LATENCY_RE.exec(sentence);
    if (!match) continue;
    const n = parseFloat(match[1]);
    if (!Number.isFinite(n)) continue;
    const unit = match[2].toLowerCase();
    const seconds = /^(?:ms|millisecond|milliseconds|مللي)/.test(unit) ? n / 1000 : n;
    if (seconds > 0) return seconds;
  }
  return null;
}

/** Read an uptime/availability percentage. */
export function parseUptimePercent(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = UPTIME_RE.exec(normalizeSeparators(text));
  if (!match) return null;
  const raw = match[1] ?? match[2];
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/** A user figure and whether the text called it concurrent. */
export interface UserFigures {
  total: number | null;
  concurrent: number | null;
}

/**
 * Split a text's user figures into total and concurrent.
 *
 * A figure counts as concurrent only when a concurrency word sits in the words
 * between the number and its noun ("4,000 concurrent users") or immediately
 * around the phrase. Everything else is a total — which is the reading a client
 * intends by "up to 1,000 users", and treating it as concurrency inflates the
 * sizing of every downstream stage.
 */
export function parseUserFigures(text: string | null | undefined): UserFigures {
  const out: UserFigures = { total: null, concurrent: null };
  if (!text) return out;
  const normalized = normalizeSeparators(text).replace(/,/g, '');

  USER_FIGURE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = USER_FIGURE_RE.exec(normalized)) !== null) {
    const n = toNumber(match[1], match[2]);
    if (n === null || n < 1) continue;
    // "concurrent" is looked for in the words between the figure and its noun
    // ("4,000 concurrent users") and in a short window AFTER the phrase
    // ("1,000 users at peak"). Deliberately NOT in a window before the figure:
    // that window reaches back over the *previous* clause, and on the real
    // sentence "4,000 concurrent users across 60,000 registered patients" it
    // saw the earlier "concurrent" and marked the registered total as
    // concurrency — manufacturing exactly the conflation this module exists to
    // prevent. The window is also cut at the first clause boundary so it cannot
    // borrow a qualifier from the next phrase.
    const after = clauseHead(normalized.slice(match.index + match[0].length, match.index + match[0].length + 22));
    const isConcurrent =
      CONCURRENT_MARKER.test(match[3] ?? '') || CONCURRENT_MARKER.test(after);
    if (isConcurrent) {
      out.concurrent = out.concurrent === null ? n : Math.max(out.concurrent, n);
    } else {
      out.total = out.total === null ? n : Math.max(out.total, n);
    }
  }
  return out;
}

/** The text up to the first clause boundary — never spills into the next phrase. */
function clauseHead(text: string): string {
  return text.split(/[,;.،؛]|\band\b|\bacross\b|\bplus\b|\bو\b/i)[0] ?? '';
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?؟\n;])\s+/);
}

// ── the resolver ────────────────────────────────────────────────────────────

/**
 * Assemble the resolver's input from a session, the same way at every call site.
 *
 * This is the half that makes the guarantee real. `resolveServiceTargets` is
 * pure, so two stages agree **only if they hand it the same text** — and three
 * hand-rolled copies of this assembly would eventually differ by one field and
 * the figures would drift apart again exactly as they did before. One helper,
 * three callers, no agent importing another agent.
 */
export function serviceTargetInput(source: {
  slots?: SlotMap | null;
  summary?: { scale?: string[]; constraints?: string[] } | null;
}): ServiceTargetInput {
  const slot = (key: 'scale_expectations' | 'constraints'): string => {
    const value = source.slots?.[key];
    return value && !value.na ? value.value : '';
  };
  return {
    scaleText: [slot('scale_expectations'), ...(source.summary?.scale ?? [])]
      .filter(Boolean)
      .join('. '),
    constraintsText: [
      slot('constraints'),
      ...(source.summary?.constraints ?? []),
    ]
      .filter(Boolean)
      .join('. '),
  };
}

/** Everything the resolver reads. All optional — an interview may state none. */
export interface ServiceTargetInput {
  /** The `scale_expectations` slot — the client's own words about volume. */
  scaleText?: string | null;
  /** The `constraints` slot. */
  constraintsText?: string | null;
  /**
   * Any further prose that may carry a stated figure: the idea, requirement
   * descriptions, existing NFRs. Read only for figures the slots did not supply.
   */
  extraText?: string | null;
}

/**
 * Resolve every shared figure, once.
 *
 * Order matters and is deliberate: **stated beats proposed, and proposed is
 * still recorded as a target** so the next stage reuses it rather than inventing
 * a second one. A `latency` the interview never mentioned becomes
 * `{value: 2, source: 'proposed'}` — and because every stage resolves the same
 * way from the same input, the vision's metric and the requirement doc's NFR are
 * the same number by construction, not by a sync step somebody has to remember.
 *
 * `concurrentUsers` is **only ever derived when it was not stated**, and it
 * carries its derivation. Nothing in this module ever relabels a total as a
 * concurrency figure.
 */
export function resolveServiceTargets(
  input: ServiceTargetInput,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): ServiceTargets {
  const sources = [input.scaleText, input.constraintsText, input.extraText];
  const targets: ServiceTargets = {};

  const latency = firstOf(sources, parseLatencySeconds);
  targets.latency = {
    key: 'latency',
    value: latency ?? DEFAULT_LATENCY_SECONDS,
    unit: 'seconds',
    source: latency === null ? 'proposed' : 'stated',
  };

  const uptime = firstOf(sources, parseUptimePercent);
  targets.uptime = {
    key: 'uptime',
    value: uptime ?? DEFAULT_UPTIME_PERCENT,
    unit: 'percent',
    source: uptime === null ? 'proposed' : 'stated',
  };

  // Figures are read across all sources and merged, so a total stated in the
  // scale slot and a concurrency stated in a constraint both survive.
  const figures = sources.reduce<UserFigures>(
    (acc, text) => {
      const found = parseUserFigures(text);
      return {
        total: pickMax(acc.total, found.total),
        concurrent: pickMax(acc.concurrent, found.concurrent),
      };
    },
    { total: null, concurrent: null },
  );

  if (figures.total !== null) {
    targets.totalUsers = {
      key: 'totalUsers',
      value: figures.total,
      unit: 'users',
      source: 'stated',
    };
  }

  if (figures.concurrent !== null) {
    targets.concurrentUsers = {
      key: 'concurrentUsers',
      value: figures.concurrent,
      unit: 'users',
      source: 'stated',
    };
  } else if (figures.total !== null) {
    // The ONLY path from a total to a concurrency figure, and it announces
    // itself. Never a silent relabel of the same number.
    const derived = Math.max(
      MIN_CONCURRENT_USERS,
      Math.round(figures.total * CONCURRENT_USER_RATIO),
    );
    targets.concurrentUsers = {
      key: 'concurrentUsers',
      value: derived,
      unit: 'users',
      source: 'derived',
      derivation: concurrencyDerivation(figures.total, derived, language),
    };
  }

  return targets;
}

function firstOf(
  sources: (string | null | undefined)[],
  parse: (text: string | null | undefined) => number | null,
): number | null {
  for (const text of sources) {
    const value = parse(text);
    if (value !== null) return value;
  }
  return null;
}

function pickMax(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

// ── rendering (localized) ───────────────────────────────────────────────────

const TARGET_COPY: LocalizedCopy<{
  concurrencyDerivation: (total: string, derived: string, pct: string) => string;
  latency: (value: string) => string;
  uptime: (value: string) => string;
  totalUsers: (value: string) => string;
  concurrentUsers: (value: string) => string;
  proposed: string;
  stated: string;
}> = {
  en: {
    concurrencyDerivation: (total, derived, pct) =>
      `Assumes about ${pct}% of the ${total} registered users are active at the same time at peak, giving roughly ${derived} concurrent users. Confirm this ratio with the client before sizing infrastructure to it.`,
    latency: (value) => `Interactive pages and searches respond within ${value} seconds.`,
    uptime: (value) => `The service is available ${value}% of the time.`,
    totalUsers: (value) => `The system supports up to ${value} registered users.`,
    concurrentUsers: (value) => `The system handles about ${value} users active at the same time.`,
    proposed: 'proposed target — the interview did not state one',
    stated: 'stated by the client',
  },
  ar: {
    concurrencyDerivation: (total, derived, pct) =>
      `يفترض أن نحو ${pct}٪ من المستخدمين المسجلين البالغ عددهم ${total} نشطون في الوقت نفسه عند الذروة، أي ما يقارب ${derived} مستخدمًا متزامنًا. يُرجى تأكيد هذه النسبة مع العميل قبل تحجيم البنية التحتية بناءً عليها.`,
    latency: (value) => `تستجيب الصفحات التفاعلية وعمليات البحث خلال ${value} ثانية.`,
    uptime: (value) => `تبلغ نسبة إتاحة الخدمة ${value}٪ من الوقت.`,
    totalUsers: (value) => `يدعم النظام ما يصل إلى ${value} مستخدم مسجل.`,
    concurrentUsers: (value) => `يتعامل النظام مع نحو ${value} مستخدم نشط في الوقت نفسه.`,
    proposed: 'هدف مقترح — لم تُذكر قيمة في المقابلة',
    stated: 'ذكره العميل',
  },
};

function concurrencyDerivation(
  total: number,
  derived: number,
  language: ArtifactLanguage,
): string {
  return copyFor(TARGET_COPY, language).concurrencyDerivation(
    formatNumber(total),
    formatNumber(derived),
    formatNumber(CONCURRENT_USER_RATIO * 100),
  );
}

/** A figure as it should be written — no trailing `.0`, no locale separators. */
export function formatTargetValue(target: ServiceTarget): string {
  return formatNumber(target.value);
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * One requirement-style sentence per target, in the artifact's language.
 *
 * Whole sentences from a `LocalizedCopy` table with only a numeral interpolated
 * — never an English template wrapped around a translated fragment, which is the
 * broken-grammar class this codebase fixed once already.
 */
export function serviceTargetSentence(
  target: ServiceTarget,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): string {
  const copy = copyFor(TARGET_COPY, language);
  const value = formatTargetValue(target);
  switch (target.key) {
    case 'latency':
      return copy.latency(value);
    case 'uptime':
      return copy.uptime(value);
    case 'totalUsers':
      return copy.totalUsers(value);
    case 'concurrentUsers':
      return copy.concurrentUsers(value);
  }
}

/**
 * The agreed-figures block every stage's prompt carries.
 *
 * English, like every prompt — `outputLanguageRules` decides what language the
 * model *answers* in. The instruction is phrased as a prohibition on restating
 * the figure differently, because "be consistent" is exactly the kind of rule a
 * model satisfies in spirit and violates in digits: 1.5 and 2 are both "about
 * two seconds" to a language model, and to a client reading two pages of one
 * proposal they are a contradiction.
 */
export function serviceTargetsPromptBlock(targets: ServiceTargets): string {
  const entries = Object.values(targets).filter(Boolean) as ServiceTarget[];
  if (entries.length === 0) return '';

  const lines = [
    'AGREED FIGURES — these exact numbers are already fixed for this project and',
    'appear in several documents the same client reads. Use them VERBATIM wherever',
    'you refer to the underlying quantity, with the same unit. Do NOT round them,',
    'restate them as a range, convert the unit, or substitute your own estimate —',
    'a page that says 1.5 seconds beside a page that says 2 seconds reads to the',
    'client as two different promises.',
  ];
  for (const target of entries) {
    lines.push(`- ${PROMPT_LABEL[target.key]}: ${formatTargetValue(target)}${PROMPT_UNIT[target.unit]} (${target.source})`);
  }
  const concurrency = targets.concurrentUsers;
  if (concurrency?.source === 'derived') {
    lines.push(
      `- The concurrent-user figure is DERIVED, not stated. ${concurrency.derivation ?? ''}`,
      '  Never describe the registered-user total as a concurrent-user count: they',
      '  are different quantities and the client stated only the first.',
    );
  }
  return lines.join('\n');
}

const PROMPT_LABEL: Record<ServiceTargetKey, string> = {
  latency: 'Response-time target for interactive pages and searches',
  uptime: 'Availability target',
  totalUsers: 'Total registered users the system must support',
  concurrentUsers: 'Users active at the same time (concurrency)',
};

const PROMPT_UNIT: Record<TargetUnit, string> = {
  seconds: ' seconds',
  percent: '%',
  users: ' users',
};
