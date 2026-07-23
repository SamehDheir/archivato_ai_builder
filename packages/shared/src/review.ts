/**
 * The Review Report — output of the AI Architect Review stage. Produced by the
 * Reviewer agent from the full pipeline (interview through API design): a
 * holistic score with per-dimension sub-scores, categorized findings
 * (security, scalability, performance, cost) plus missing requirements and
 * suggestions.
 */

import {
  copyFor,
  toArtifactLanguage,
  type ArtifactLanguage,
  type LocalizedArtifact,
  type LocalizedCopy,
} from './artifact-language';
import type { DerivedArtifact } from './freshness';
import type { GenerationProvenance } from './generation';
import { hasTimelineConflict, parseTimelineWeeks, type EffortEstimate } from './effort';
import type { BuildVsBuyItem, ConstraintCompliance } from './system-design';
import type { ServiceCostLine } from './cost-estimate';
import type {
  HostingChoice,
  HostingRecommendation,
} from './cost-estimate.hosting';
import type { OutOfScopeItem } from './requirements';
import { significantTokens } from './text';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

// ── R11: findings → actionable fixes ────────────────────────────────────────
//
// A finding is only useful if the owner can *act* on it. R11 classifies each one
// into how it gets resolved, and tracks where it got to. The schema lives here
// (it is part of the artifact); the classification rules, the patch contract, and
// the appliers live in `review.fix.ts`, which imports this file one-way — never
// the reverse, or the barrel would have a runtime cycle.

/**
 * How a finding gets resolved (R11).
 *
 * - `patch` — an LLM can rewrite the named artifact section to fix it.
 * - `needs_client` — only the client can settle it; it converts to an open
 *   question or an out-of-scope line. No LLM call.
 * - `advisory` — guidance to acknowledge or dismiss; nothing to mutate.
 *
 * Optional: findings on pre-R11 rows carry none, and `resolveFindingAction`
 * reads that absence as `advisory` (never guess a mutation onto an old row).
 */
export type FindingActionType = 'patch' | 'needs_client' | 'advisory';

/** The stages whose artifacts a patch may write. */
export type PatchableStage =
  | 'requirements'
  | 'system-design'
  | 'database-design'
  | 'api-design';

/** Where a `patch` finding's fix would land. */
export interface PatchTarget {
  stage: PatchableStage;
  /** The artifact field to rewrite, e.g. `nonFunctional`. See `PATCH_SECTIONS`. */
  sectionHint: string;
}

/**
 * Where a finding got to (R11). Reset to `open` by every review re-run — a re-run
 * is a fresh assessment, and the durable history lives in the session's append-only
 * `fixLog`, not here. Optional for back-compat; absent reads as `open`.
 */
export type FindingStatus = 'open' | 'resolved' | 'converted' | 'dismissed';

export interface ReviewFinding {
  /**
   * Stable within one report — `"<section>:<index>"`, assigned deterministically
   * by `normalizeReviewReport` at both the write and read boundaries, so a
   * pre-R11 row gets ids on read rather than being unactionable forever.
   */
  id?: string;
  title: string;
  detail: string;
  severity: Severity;
  /** How this finding gets resolved (R11). Absent ⇒ read as `advisory`. */
  actionType?: FindingActionType;
  /** Only meaningful when `actionType === 'patch'`. */
  patchTarget?: PatchTarget;
  /** Absent ⇒ read as `open`. */
  status?: FindingStatus;
  /** The note captured when the owner dismissed it. */
  statusNote?: string;
}

/** 0–100 health sub-scores, one per review dimension. */
export interface ReviewScores {
  security: number;
  scalability: number;
  performance: number;
  cost: number;
  /**
   * Deal / client-readiness axis (R10). Optional for back-compat with pre-R10
   * rows. A separate lens from the engineering dimensions — it does NOT feed
   * `overallScore`, and it is stripped from the public share payload (owner-only).
   */
  clientReadiness?: number;
}

// ── R10: client-readiness axis + cross-artifact consistency ─────────────────

/** How a client-readiness finding should be resolved (manual guidance, A1). */
export type SuggestedResolution =
  | 'add_open_question'
  | 'add_out_of_scope'
  | 'tighten_requirement'
  | 'align_summary';

export const SUGGESTED_RESOLUTIONS: readonly SuggestedResolution[] = [
  'add_open_question',
  'add_out_of_scope',
  'tighten_requirement',
  'align_summary',
] as const;

export function isSuggestedResolution(value: string): value is SuggestedResolution {
  return (SUGGESTED_RESOLUTIONS as readonly string[]).includes(value);
}

/** Whether a finding came from a deterministic code check or the AI reviewer. */
export type FindingSource = 'automated' | 'ai';

/**
 * A deal-risk finding on the client-readiness axis (A1). Unlike an engineering
 * finding it carries a manual resolution path — the owner fixes it upstream (adds
 * an open question, tightens a requirement, aligns the summary, …). Auto-apply is
 * deliberately out of scope; the UI renders these as guidance.
 */
export interface ClientReadinessFinding extends ReviewFinding {
  suggestedResolution: SuggestedResolution;
  /** A short, concrete instruction for the owner. */
  resolutionHint: string;
}

/**
 * A cross-artifact consistency finding (A2): two artifacts that contradict each
 * other. `source` distinguishes a deterministic code check ('automated') from the
 * AI reviewer's judgment ('ai') so the UI can tag them; `artifacts` names the two
 * that conflict, e.g. ['effort', 'timeline'].
 */
export interface ConsistencyFinding extends ReviewFinding {
  source: FindingSource;
  artifacts: [string, string];
}

export interface ReviewReport extends DerivedArtifact, LocalizedArtifact {
  /** How this report was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  sessionId: string;
  generatedAt: string;
  /** Holistic 0–100 assessment across the engineering dimensions. */
  overallScore: number;
  /** Per-dimension 0–100 sub-scores. */
  scores: ReviewScores;
  /**
   * Legacy alias of `scores.scalability`, kept so older clients/exports keep
   * working. Prefer `scores` / `overallScore`.
   */
  scalabilityScore: number;
  summary: string;
  securityIssues: ReviewFinding[];
  /** Scalability problems (horizontal scaling, async processing, boundaries). */
  scalabilityIssues: ReviewFinding[];
  performanceRisks: ReviewFinding[];
  /** Cost-optimization opportunities (caching, right-sizing, idle infra). */
  costOptimizations: ReviewFinding[];
  /** Missing requirements / features the design should cover. */
  missingFeatures: string[];
  /** High-level suggestions. */
  recommendations: string[];
  /**
   * Deal-risk findings on the client-readiness axis (R10), each with a manual
   * resolution. **OWNER-ONLY** — stripped from the public share payload. Optional
   * for back-compat; consumers tolerate absence.
   */
  clientReadinessIssues?: ClientReadinessFinding[];
  /**
   * Cross-artifact consistency findings (R10) — deterministic ('automated') +
   * AI ('ai'), merged. **OWNER-ONLY** (deal risks). Optional for back-compat.
   */
  consistencyFindings?: ConsistencyFinding[];
  /**
   * Set by the deterministic fallback (R10) when the client-readiness axis needs a
   * real LLM pass to be assessed — the score is then a neutral baseline. OWNER-ONLY.
   */
  clientReadinessNote?: string;
}

/** Inputs for the deterministic cross-artifact consistency checks (A2). */
export interface ConsistencyCheckInput {
  /** The (deterministic) effort estimate. */
  effort?: EffortEstimate | null;
  /** The timeline slot value (raw text). */
  timeline?: string | null;
  /** Constraints that ought to be covered (requirements + slots). */
  constraints?: string[];
  /** The design's constraint-compliance coverage. */
  constraintCompliance?: ConstraintCompliance[];
  /** The design's build-vs-buy calls. */
  buildVsBuy?: BuildVsBuyItem[];
  /**
   * The cost estimate's service-subscription lines. Undefined ⇒ skip that check
   * (no cost estimate to compare against); a present-but-empty array is a real
   * signal that a "buy" has no cost line.
   */
  serviceSubscriptions?: ServiceCostLine[];
  /**
   * The System Design's hosting decision, as the three real states.
   *
   * Paired with `costHosting` below to catch the contradiction this check was
   * added for: the Cost stage headlining a provider the architecture never
   * chose. Undefined ⇒ skip (nothing to compare).
   */
  designHosting?: HostingChoice;
  /**
   * The stored cost estimate's headline hosting recommendation. Undefined or
   * null ⇒ skip — there is no cost estimate to contradict the design yet, and
   * flagging its absence is the freshness system's job, not this one.
   */
  costHosting?: HostingRecommendation | null;
  /** What the requirement document declares NOT included. */
  outOfScope?: OutOfScopeItem[];
  /**
   * Everything the rest of the package promises to build, as `{label, artifact}`
   * — functional requirements, services, API groups. Compared against
   * `outOfScope` to catch a capability that is excluded and delivered at once.
   */
  promisedCapabilities?: PromisedCapability[];
  /**
   * The language to compose the findings in.
   *
   * These are code-composed sentences that interpolate values the model wrote
   * (a constraint, an excluded capability, a bought service). Leaving the
   * surrounding prose in English while the value came back Arabic is the exact
   * half-and-half sentence this system exists to prevent — and these land in the
   * owner's review panel, which is rendered in their locale.
   *
   * Optional so an existing caller compiles; absent reads as English.
   */
  language?: ArtifactLanguage;
}

/** One thing the package says it will deliver, and which artifact says so. */
export interface PromisedCapability {
  /** Short name, shown in the finding. */
  label: string;
  /**
   * The full text to match against — title *and* description. Kept separate
   * from `label` so widening what we search doesn't drag a paragraph into the
   * finding the owner reads. Falls back to `label` when absent.
   */
  text?: string;
  artifact: string;
}

/**
 * Words that carry no distinguishing meaning in a scoping document, so a match
 * on one of them says nothing. Without this, "Advanced analytics **and custom
 * reports**" matches any requirement containing the word "custom".
 */
const SCOPE_STOP_WORDS = new Set([
  'user',
  'users',
  'system',
  'systems',
  'data',
  'support',
  'supports',
  'manage',
  'management',
  'custom',
  'advanced',
  'basic',
  'simple',
  'automatic',
  'automated',
  'native',
  'access',
  'view',
  'with',
  'from',
  'that',
  'this',
  'their',
  'they',
  'them',
  'when',
  'each',
  'into',
  'over',
  'able',
  'only',
  'other',
  'more',
  'full',
  'real',
  'time',
  'time',
  'app',
  'apps',
  'application',
  'applications',
  'feature',
  'features',
  'functionality',
  'client',
  'clients',
  'project',
  'service',
  'services',
  'platform',
  'software',
]);

/**
 * How many distinctive words two phrases must share before we call it the same
 * capability.
 *
 * Two, not one, and this is the whole difference between a check people read and
 * a check people mute. One shared word ("payments") fires on any project that
 * excludes payouts while taking payments — a distinction the document draws
 * deliberately. Two co-occurring distinctive words ("live" + "tracking",
 * "mobile" + "android") is a much stronger claim that the same capability is
 * being described twice.
 */
const SCOPE_MATCH_MIN_TOKENS = 2;

/**
 * Does this promised capability describe the same thing as an out-of-scope item?
 *
 * Deliberately conservative: a missed contradiction leaves the reviewer's LLM
 * pass to catch it, whereas a false one tells an owner their own document
 * contradicts itself when it doesn't — and the second failure is the one that
 * makes the whole consistency panel worth ignoring.
 */
export function describesSameCapability(
  excluded: string,
  promised: string,
): boolean {
  const a = significantTokens(excluded, SCOPE_STOP_WORDS);
  if (a.length === 0) return false;
  const b = new Set(significantTokens(promised, SCOPE_STOP_WORDS));
  const shared = a.filter((t) => b.has(t));
  if (shared.length >= SCOPE_MATCH_MIN_TOKENS) return true;
  // A single-token exclusion ("Telemedicine") can only match on that one word,
  // so it needs the whole phrase to carry it rather than a partial overlap.
  return a.length === 1 && shared.length === 1;
}

/**
 * Does this short feature name refer to an already-excluded capability?
 *
 * A different question from `describesSameCapability`, and it needs a different
 * test. There we compare two full phrases; here one side is a bare label the
 * reviewer coined ("Telemedicine functionality") against the document's own
 * fuller wording ("Telemedicine / live video consultations"). They overlap on a
 * single word, which the two-token bar rejects — correctly for phrase-vs-phrase,
 * wrongly for label-vs-phrase.
 *
 * So the test is **containment**: every distinctive word of the feature name
 * appears in the exclusion. That is a strong claim (the label adds nothing the
 * exclusion doesn't already say) and it cannot fire on a partial overlap.
 */
export function namesExcludedCapability(
  excluded: string,
  feature: string,
): boolean {
  const featureTokens = significantTokens(feature, SCOPE_STOP_WORDS);
  if (featureTokens.length === 0) return false;
  const excludedTokens = new Set(significantTokens(excluded, SCOPE_STOP_WORDS));
  if (excludedTokens.size === 0) return false;
  return featureTokens.every((t) => excludedTokens.has(t));
}

/**
 * Is this constraint addressed by this compliance entry?
 *
 * Substring containment alone — the original test — is far too brittle to
 * compare a requirement's prose against a design's label, and it failed on real
 * output: the constraint *"The platform must integrate with existing payment
 * gateways and accounting software"* was reported as unaddressed while the
 * design's compliance table carried *"integration with payment gateways and
 * accounting software"*. `integrate with existing` is not a substring of
 * `integration with`, so a perfectly covered constraint was flagged — twice, on
 * a two-constraint project, which is a check nobody would trust again.
 *
 * Token overlap is the fix; containment is kept as an OR because exact
 * containment is genuine evidence and it still covers constraints too short to
 * produce tokens at all (`PCI DSS`).
 */
function constraintIsAddressed(constraint: string, entry: string): boolean {
  return (
    entry.includes(constraint) ||
    constraint.includes(entry) ||
    describesSameCapability(constraint, entry)
  );
}

/** Severity from how far the effort overruns the timeline. */
function timelineSeverity(effortWeeks: number, availableWeeks: number): Severity {
  return effortWeeks / availableWeeks > 1.5 ? 'high' : 'medium';
}

/**
 * Deterministic cross-artifact consistency findings (A2). Pure — every finding is
 * derivable from the artifacts, so these are always available (offline, in the
 * fallback). Each check guards its own inputs and stays silent when they're
 * missing. All findings are tagged `source: 'automated'`.
 */
/**
 * The four automated consistency findings, in every language.
 *
 * Each one wraps a value the model produced — a constraint sentence, the name of
 * an excluded capability, a bought service — so the sentence and the value have
 * to agree about what language they are in. Composing English prose around an
 * Arabic capability name is how the review panel ended up telling an owner, in
 * two languages at once, that their own document contradicted itself.
 */
const CONSISTENCY_COPY: LocalizedCopy<{
  timelineTitle: string;
  timelineDetail: (weeks: number, available: number) => string;
  constraintTitle: string;
  constraintDetail: (constraint: string) => string;
  boughtTitle: string;
  boughtDetail: (capability: string, service?: string) => string;
  scopeTitle: string;
  scopeDetail: (item: string, artifact: string, label: string) => string;
  hostingTitle: string;
  hostingMismatch: (chosen: string, headline: string) => string;
  hostingUnpriced: (chosen: string, headline: string) => string;
  hostingNotViable: (chosen: string) => string;
}> = {
  en: {
    timelineTitle: 'Effort exceeds the stated timeline',
    timelineDetail: (weeks, available) =>
      `The estimated build is at least ~${weeks} person-weeks, but the stated timeline is only ~${available} weeks. Reduce scope to hit the deadline, extend the timeline, or add people.`,
    constraintTitle: 'Constraint not addressed in the design',
    constraintDetail: (constraint) =>
      `The constraint “${constraint}” has no matching entry in the design's constraint-compliance list. Confirm the architecture actually satisfies it.`,
    boughtTitle: 'Bought capability missing from the cost estimate',
    boughtDetail: (capability, service) =>
      `The design recommends buying ${capability}${
        service ? ` (${service})` : ''
      }, but the cost estimate has no subscription line for it. Regenerate the cost estimate so the client sees the running cost.`,
    scopeTitle: 'Excluded capability appears elsewhere in the package',
    scopeDetail: (item, artifact, label) =>
      `“${item}” is listed as out of scope, but ${artifact} promises “${label}”. Either remove the exclusion or drop the capability — a client who spots both will read the exclusion as a way out of work they think they are paying for.`,
    hostingTitle: 'Cost estimate and architecture name different hosts',
    hostingMismatch: (chosen, headline) =>
      `The System Design hosts on ${chosen}, but the cost estimate headlines ${headline}. Regenerate the cost estimate, or change the architecture — sending a client a price built on a host you are not going to use makes the figure wrong and the package look unreviewed.`,
    hostingUnpriced: (chosen, headline) =>
      `The System Design hosts on ${chosen}, which the cost comparison does not price; it headlines ${headline} instead. The monthly figures therefore describe a different host than the one being proposed — price ${chosen} directly before quoting a running cost.`,
    hostingNotViable: (chosen) =>
      `The System Design hosts on ${chosen}, which cannot run the design as specified, so the cost estimate had to fall back to another provider. Fix this in the architecture — the price is a symptom, not the problem.`,
  },
  ar: {
    timelineTitle: 'الجهد المقدَّر يتجاوز المدة الزمنية المذكورة',
    timelineDetail: (weeks, available) =>
      `الجهد المقدَّر للتنفيذ لا يقل عن ${weeks} أسبوع-شخص تقريبًا، بينما المدة المذكورة نحو ${available} أسبوعًا فقط. قلّص النطاق للالتزام بالموعد، أو مدّد المدة، أو زد عدد أفراد الفريق.`,
    constraintTitle: 'قيد غير مُعالَج في التصميم',
    constraintDetail: (constraint) =>
      `القيد «${constraint}» ليس له ما يقابله في قائمة الالتزام بالقيود في التصميم. تأكّد من أن البنية تلبّيه فعليًا.`,
    boughtTitle: 'قدرة مشتراة غير مدرجة في تقدير التكلفة',
    boughtDetail: (capability, service) =>
      `يوصي التصميم بشراء ${capability}${
        service ? ` (${service})` : ''
      }، لكن تقدير التكلفة لا يتضمّن بندَ اشتراك لها. أعد توليد تقدير التكلفة ليرى العميل التكلفة التشغيلية.`,
    scopeTitle: 'قدرة مستثناة تظهر في موضع آخر من الحزمة',
    scopeDetail: (item, artifact, label) =>
      `«${item}» مُدرج ضمن ما هو خارج النطاق، لكن ${artifact} يَعِد بـ«${label}». إمّا أن تحذف الاستثناء أو تحذف القدرة — فالعميل الذي يلاحظ الأمرين سيقرأ الاستثناء على أنه تهرّب من عمل يعتقد أنه يدفع مقابله.`,
    hostingTitle: 'تقدير التكلفة والبنية يسمّيان مزوّدَي استضافة مختلفين',
    hostingMismatch: (chosen, headline) =>
      `يعتمد تصميم النظام الاستضافة على ${chosen}، بينما يتصدّر تقدير التكلفة ${headline}. أعد توليد تقدير التكلفة أو عدّل البنية — فإرسال سعر مبني على استضافة لن تُستخدم يجعل الرقم خاطئًا ويجعل الحزمة تبدو غير مراجَعة.`,
    hostingUnpriced: (chosen, headline) =>
      `يعتمد تصميم النظام الاستضافة على ${chosen}، وهو غير مُسعّر في جدول المقارنة الذي يتصدّره ${headline} بدلًا منه. لذا فالأرقام الشهرية تصف استضافة غير المقترحة — سعّر ${chosen} مباشرةً قبل تحديد تكلفة تشغيل للعميل.`,
    hostingNotViable: (chosen) =>
      `يعتمد تصميم النظام الاستضافة على ${chosen}، وهو غير قادر على تشغيل التصميم بصيغته الحالية، فاضطر تقدير التكلفة إلى الرجوع إلى مزوّد آخر. عالج هذا في البنية — فالسعر عَرَض لا سبب.`,
  },
};

export function buildConsistencyFindings(
  input: ConsistencyCheckInput,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const copy = copyFor(CONSISTENCY_COPY, toArtifactLanguage(input.language));

  // 1. Effort vs timeline. Unparseable timeline → skip. Uses the low end of the
  //    estimate (weeksMin): a conflict means even the best case blows the deadline.
  const available = parseTimelineWeeks(input.timeline);
  if (
    input.effort &&
    available !== null &&
    available > 0 &&
    hasTimelineConflict(input.effort.weeksMin, input.timeline)
  ) {
    const weeks = input.effort.weeksMin;
    findings.push({
      source: 'automated',
      artifacts: ['effort', 'timeline'],
      title: copy.timelineTitle,
      detail: copy.timelineDetail(weeks, Math.round(available)),
      severity: timelineSeverity(weeks, available),
    });
  }

  // 2. Constraint coverage: a stated constraint with no matching compliance entry.
  const coverage = (input.constraintCompliance ?? []).map((c) =>
    c.constraint.trim().toLowerCase(),
  );
  for (const c of input.constraints ?? []) {
    const key = c.trim().toLowerCase();
    if (!key) continue;
    const covered = coverage.some((cc) => constraintIsAddressed(key, cc));
    if (!covered) {
      findings.push({
        source: 'automated',
        artifacts: ['constraints', 'constraintCompliance'],
        title: copy.constraintTitle,
        detail: copy.constraintDetail(c),
        severity: 'medium',
      });
    }
  }

  // 3. Build-vs-buy "buy" without a matching cost line (only when a cost estimate
  //    exists to compare against — a stale one can miss a newly-bought capability).
  if (input.serviceSubscriptions) {
    const lineCaps = new Set(input.serviceSubscriptions.map((l) => l.capability));
    for (const item of input.buildVsBuy ?? []) {
      if (item.recommendation !== 'buy') continue;
      if (!lineCaps.has(item.capability)) {
        findings.push({
          source: 'automated',
          artifacts: ['buildVsBuy', 'serviceSubscriptions'],
          title: copy.boughtTitle,
          detail: copy.boughtDetail(
            item.capability.replace(/_/g, ' '),
            item.suggestedService,
          ),
          severity: 'low',
        });
      }
    }
  }

  // 4. Scope integrity: a capability the document excludes that the rest of the
  //    package promises anyway. This is the contradiction a client finds first —
  //    "you said mobile apps weren't included, but the plan lists them" — and it
  //    is the one that costs the dev shop the argument, because the exclusion is
  //    the only thing standing between them and building it for free.
  for (const excluded of input.outOfScope ?? []) {
    const item = excluded.item?.trim();
    if (!item) continue;
    const conflict = (input.promisedCapabilities ?? []).find((p) =>
      describesSameCapability(item, p.text ?? p.label),
    );
    if (conflict) {
      findings.push({
        source: 'automated',
        artifacts: ['outOfScope', conflict.artifact],
        title: copy.scopeTitle,
        detail: copy.scopeDetail(item, conflict.artifact, conflict.label),
        severity: 'medium',
      });
    }
  }

  // 5. Hosting: the Cost stage's headline provider vs the host the System Design
  //    actually chose.
  //
  //    This is the regression guard for the bug that motivated it — an Azure
  //    project whose cost page recommended Fly.io "because the System Design did
  //    not name a host". The reconciliation now prevents that at the source, so
  //    on a healthy project this check is silent; it fires when the two stages
  //    have drifted apart for a reason the reconciliation cannot fix on its own:
  //    a stale estimate generated before the architecture changed its host, a
  //    host nobody prices, or a host that cannot run the design.
  //
  //    Severity is `high` for a plain mismatch because the number is what the
  //    client reads, and a monthly figure computed against the wrong host is
  //    simply wrong — not merely inconsistent.
  const designHosting = input.designHosting;
  const costHosting = input.costHosting;
  if (designHosting && designHosting.kind !== 'none' && costHosting) {
    const chosenLabel =
      (designHosting.kind === 'priced'
        ? designHosting.label ?? designHosting.provider
        : designHosting.label) || '';
    const headline = costHosting.provider;
    const mismatched =
      designHosting.kind !== 'priced' || designHosting.provider !== headline;

    if (mismatched && chosenLabel) {
      const detail =
        costHosting.source === 'design-not-viable'
          ? copy.hostingNotViable(chosenLabel)
          : designHosting.kind === 'unpriced'
            ? copy.hostingUnpriced(chosenLabel, headline)
            : copy.hostingMismatch(chosenLabel, headline);
      findings.push({
        source: 'automated',
        artifacts: ['the architecture', 'the cost estimate'],
        title: copy.hostingTitle,
        detail,
        severity:
          costHosting.source === 'design-not-viable' ||
          designHosting.kind === 'priced'
            ? 'high'
            : 'medium',
      });
    }
  }

  return findings;
}

/**
 * Strip the workflow layer (R11) off a finding. The public page gets the finding
 * itself — never how the owner is dealing with it. A `status: 'dismissed'` chip
 * or a `patchTarget` on a client's proposal is the owner's private working state;
 * leaking it would tell the client which risks their vendor waved away.
 */
function redactFinding<T extends ReviewFinding>(finding: T): T {
  const { id, actionType, patchTarget, status, statusNote, ...rest } = finding;
  return rest as T;
}

/**
 * Strip the OWNER-ONLY parts of a review before it crosses onto the public share
 * page (R10/R11). Two lenses come off:
 *
 * - the **client-readiness axis** — a *deal-risk* lens (promises without a backing
 *   requirement, budget/timeline conflicts), exactly like R9's budget warning; and
 * - the **fix workflow** (R11) — ids, action types, patch targets, and statuses.
 *
 * The engineering findings themselves stay, since the review lives in the technical
 * appendix — but they cross as plain `ReviewFinding`s, byte-identical to what the
 * share page carried before R11. Pure, so the enforcement is one testable rule.
 */
export function redactReviewForShare(review: ReviewReport): ReviewReport {
  const scores: ReviewScores = { ...review.scores };
  delete scores.clientReadiness;
  return {
    ...review,
    scores,
    securityIssues: (review.securityIssues ?? []).map(redactFinding),
    scalabilityIssues: (review.scalabilityIssues ?? []).map(redactFinding),
    performanceRisks: (review.performanceRisks ?? []).map(redactFinding),
    costOptimizations: (review.costOptimizations ?? []).map(redactFinding),
    clientReadinessIssues: [],
    consistencyFindings: [],
    clientReadinessNote: undefined,
  };
}
