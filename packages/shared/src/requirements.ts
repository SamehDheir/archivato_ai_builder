/**
 * The formal Requirement Document — the output of the Requirement Engineer
 * stage, produced from a confirmed interview. Structured JSON (spec Step 3).
 */

import type { OpenQuestion } from './interview';
import type { GenerationProvenance } from './generation';

export type RequirementPriority = 'must' | 'should' | 'could';

export interface FunctionalRequirement {
  /** Stable id, e.g. "FR-1". */
  id: string;
  title: string;
  description: string;
  priority: RequirementPriority;
}

export interface NonFunctionalRequirement {
  /** Stable id, e.g. "NFR-1". */
  id: string;
  /** performance | security | scalability | availability | usability | … */
  category: string;
  description: string;
}

export interface UserRole {
  name: string;
  description: string;
  permissions: string[];
}

export interface BusinessRule {
  /** Stable id, e.g. "BR-1". */
  id: string;
  description: string;
}

/**
 * A capability deliberately **not** in scope. A first-class section (R7), not a
 * footnote: it protects the dev shop from scope creep by naming, in plain client
 * language, what the price and timeline do NOT include — both the things the
 * client raised and deferred, and the things a buyer typically expects in this
 * domain but never asked for (a delivery app without live GPS tracking, say).
 */
export interface OutOfScopeItem {
  /** The excluded capability, in the client's own vocabulary. */
  item: string;
  /** Why it's excluded or deferred (optional — some exclusions are self-evident). */
  reason?: string;
}

/**
 * An assumption the document rests on, paired with what breaks if it's wrong.
 * The merged home (R7) for the interview's open questions (the owner couldn't
 * answer, so we assumed a default) plus the assumptions the agent itself made to
 * fill genuine gaps — surfaced so a client can correct a wrong one before it
 * costs a re-scope.
 */
export interface RequirementAssumption {
  assumption: string;
  /** The concrete consequence if this assumption turns out to be false. */
  impactIfWrong: string;
}

export interface RequirementDocument {
  sessionId: string;
  /** ISO timestamp. */
  generatedAt: string;
  /**
   * How this document was produced (see `generation.ts`). Optional: rows written
   * before provenance existed carry none, and absent means "unknown", never
   * "degraded".
   */
  generation?: GenerationProvenance;
  /**
   * A 3–4 sentence, jargon-free executive summary written for the non-technical
   * end client: who the system serves, what it lets them do, and the business
   * outcome it enables. Optional — old rows / plan-mode runs won't have it, so
   * every consumer must tolerate its absence.
   */
  executiveSummary?: string;
  functional: FunctionalRequirement[];
  nonFunctional: NonFunctionalRequirement[];
  roles: UserRole[];
  businessRules: BusinessRule[];
  constraints: string[];
  /**
   * Legacy flat assumption list. Kept for backward compatibility (old rows,
   * the Markdown exporters) and as the fallback source for
   * `assumptionsAndOpenQuestions` when that richer field is absent.
   */
  assumptions: string[];
  /**
   * Things explicitly not being built (R7). Optional — absent on old rows, in
   * which case the section is simply not shown.
   */
  outOfScope?: OutOfScopeItem[];
  /**
   * The document's assumptions + the interview's open questions, each with its
   * impact-if-wrong (R7). Optional — when absent, consumers fall back to the
   * flat `assumptions` list plus `openQuestions`.
   */
  assumptionsAndOpenQuestions?: RequirementAssumption[];
  /**
   * Gaps the owner couldn't answer during the interview, carried through from the
   * slot-filling pass (R6). Retained alongside `assumptionsAndOpenQuestions`
   * (which folds them in) so the raw client-question text stays available. Optional
   * — old rows and plan-mode runs won't have it, so every consumer must tolerate
   * its absence.
   */
  openQuestions?: OpenQuestion[];
}
