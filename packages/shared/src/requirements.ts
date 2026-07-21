/**
 * The formal Requirement Document — the output of the Requirement Engineer
 * stage, produced from a confirmed interview. Structured JSON (spec Step 3).
 */

import type { LocalizedArtifact } from './artifact-language';
import type { OpenQuestion } from './interview';
import type { GenerationProvenance } from './generation';
import { stripUrls } from './prompt-safety';

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
 * Whether an entry is something we may proceed on, or something only the client
 * can settle.
 *
 * The section was one undifferentiated list, and that flattened a real
 * distinction: *"standard TLS encryption is sufficient"* is a low-stakes default
 * a dev shop can reasonably run with, whereas *"either Microsoft Teams or Slack
 * will be chosen as the notification platform"* is a decision that changes the
 * integration work, and it shipped worded as though it were already settled. A
 * client skimming the section sees an assumption they are invited to accept, and
 * a choice they never made is then quietly baked into the scope.
 *
 * `open_question` is the honest label for the second kind: it is unresolved, the
 * client must answer it, and if the design had to pick something to keep moving,
 * that pick is a placeholder rather than a considered recommendation.
 */
export type AssumptionKind = 'assumption' | 'open_question';

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
  /**
   * Optional and additive: absent entries render as plain assumptions, which is
   * what every row written before this existed actually was.
   */
  kind?: AssumptionKind;
}

export function isAssumptionKind(value: unknown): value is AssumptionKind {
  return value === 'assumption' || value === 'open_question';
}

export interface RequirementDocument extends LocalizedArtifact {
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

/**
 * Strip links from every prose field of a requirement document, and report what
 * was removed.
 *
 * This is the outbound half of the prompt-injection defense. The document is
 * generated from text the owner did not write and is then rendered on a public,
 * unauthenticated share page, so a link injected through the interview would be
 * delivered to the client by their own vendor. No layer above this can promise
 * the model ignored the injection; this one does not have to ask.
 *
 * **It screens the whole document, including the technical sections.** The first
 * cut deliberately spared `nonFunctional` / `businessRules` / `constraints` on
 * the grounds that they are for the dev team, who can judge a link to a payment
 * provider's spec. That was wrong, and a test caught it: R7 moved exactly those
 * three sections into the share page's *technical appendix*, so they are as
 * public as the executive summary. There is no section of this artifact that
 * only the dev team sees, so there is no section that can be left unscreened.
 * A genuinely useful reference link can still be added in the structured editor,
 * which is authored by the owner rather than by the client's brief.
 */
export function screenRequirementDocument(doc: RequirementDocument): {
  document: RequirementDocument;
  removed: string[];
} {
  const removed: string[] = [];
  const clean = (text: string): string => {
    const result = stripUrls(text);
    removed.push(...result.removed);
    return result.text;
  };

  // Every array is read through `?? []`. The type says they are required, but this
  // runs over **stored** rows too (a chat refine screens the document it loaded),
  // and a JSON row written before a field existed still violates the type it is
  // cast to — the `normalizeApiDesign` lesson, where a missing required array
  // took out the OpenAPI export. A screen that throws would fail the generation
  // it was meant to protect.
  const document: RequirementDocument = {
    ...doc,
    executiveSummary: doc.executiveSummary ? clean(doc.executiveSummary) : doc.executiveSummary,
    functional: (doc.functional ?? []).map((fr) => ({
      ...fr,
      title: clean(fr.title ?? ''),
      description: clean(fr.description ?? ''),
    })),
    roles: (doc.roles ?? []).map((role) => ({
      ...role,
      name: clean(role.name ?? ''),
      description: clean(role.description ?? ''),
      permissions: (role.permissions ?? []).map((p) => clean(p ?? '')),
    })),
    nonFunctional: (doc.nonFunctional ?? []).map((nfr) => ({
      ...nfr,
      description: clean(nfr.description ?? ''),
    })),
    businessRules: (doc.businessRules ?? []).map((br) => ({
      ...br,
      description: clean(br.description ?? ''),
    })),
    constraints: (doc.constraints ?? []).map((c) => clean(c ?? '')),
    assumptions: (doc.assumptions ?? []).map((a) => clean(a ?? '')),
    ...(doc.outOfScope
      ? {
          outOfScope: doc.outOfScope.map((item) => ({
            ...item,
            item: clean(item.item ?? ''),
            ...(item.reason ? { reason: clean(item.reason) } : {}),
          })),
        }
      : {}),
    ...(doc.assumptionsAndOpenQuestions
      ? {
          assumptionsAndOpenQuestions: doc.assumptionsAndOpenQuestions.map((a) => ({
            ...a,
            assumption: clean(a.assumption ?? ''),
            impactIfWrong: clean(a.impactIfWrong ?? ''),
          })),
        }
      : {}),
  };

  return { document, removed };
}
