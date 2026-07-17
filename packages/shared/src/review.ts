/**
 * The Review Report — output of the AI Architect Review stage. Produced by the
 * Reviewer agent from the full pipeline (interview through API design): a
 * holistic score with per-dimension sub-scores, categorized findings
 * (security, scalability, performance, cost) plus missing requirements and
 * suggestions.
 */

import type { DerivedArtifact } from './freshness';
import { hasTimelineConflict, parseTimelineWeeks, type EffortEstimate } from './effort';
import type { BuildVsBuyItem, ConstraintCompliance } from './system-design';
import type { ServiceCostLine } from './cost-estimate';

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

export interface ReviewReport extends DerivedArtifact {
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
export function buildConsistencyFindings(
  input: ConsistencyCheckInput,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

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
      title: 'Effort exceeds the stated timeline',
      detail: `The estimated build is at least ~${weeks} person-weeks, but the stated timeline is only ~${Math.round(
        available,
      )} weeks. Reduce scope to hit the deadline, extend the timeline, or add people.`,
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
    const covered = coverage.some((cc) => cc.includes(key) || key.includes(cc));
    if (!covered) {
      findings.push({
        source: 'automated',
        artifacts: ['constraints', 'constraintCompliance'],
        title: 'Constraint not addressed in the design',
        detail: `The constraint “${c}” has no matching entry in the design's constraint-compliance list. Confirm the architecture actually satisfies it.`,
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
          title: 'Bought capability missing from the cost estimate',
          detail: `The design recommends buying ${item.capability.replace(
            /_/g,
            ' ',
          )}${
            item.suggestedService ? ` (${item.suggestedService})` : ''
          }, but the cost estimate has no subscription line for it. Regenerate the cost estimate so the client sees the running cost.`,
          severity: 'low',
        });
      }
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
