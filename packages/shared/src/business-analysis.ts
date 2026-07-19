/**
 * The Business Analysis — the discovery layer that runs between the confirmed
 * interview and the Requirement Document.
 *
 * It exists so the pipeline does not jump straight from "what did the client
 * say" to "here are the requirements": the problem, the users, the competitive
 * position and the MVP cut are reasoned about first, and that reasoning is then
 * handed to the Requirement Engineer as context.
 *
 * ## The honesty problem this type is shaped around
 *
 * This is the one artifact whose questions the model **cannot answer from the
 * interview alone**. Competitors and market size are outside knowledge, there is
 * no web access in this pipeline, and a model asked "who are the competitors"
 * will happily produce real-sounding company names with invented funding rounds.
 * It is also the most fact-checkable part of the package — the client knows
 * their own market far better than we do.
 *
 * So the type refuses to let a guess look like a fact:
 *  - every outside-knowledge claim carries a `confidence`;
 *  - the market assessment has **no TAM field** — a fabricated "$4.2B market" is
 *    worse than an honest description of the demand signals;
 *  - `researchChecklist` names what the owner must verify before sending.
 *
 * Same doctrine as `region.ts` (look the regime up, never recall it),
 * `parseBudget` (null, never a guess) and `estimateLlmCostUsd` (an unlisted
 * model returns null, not a confident $0.00).
 *
 * **OWNER-ONLY.** Nothing here reaches the public share page: a client must
 * never read their own vendor's verdict on whether their idea is worth
 * building, nor a competitor list the vendor did not research.
 */

import type { GenerationProvenance } from './generation';

/** How much weight a claim can bear. */
export type ClaimConfidence =
  /** The client said it in the interview — this is their own statement. */
  | 'stated'
  /** Reasoned from what the client said. Defensible, still the model's inference. */
  | 'inferred'
  /** Outside knowledge with nothing behind it here. Verify before using. */
  | 'unverified';

export const CLAIM_CONFIDENCES: readonly ClaimConfidence[] = [
  'stated',
  'inferred',
  'unverified',
];

/** The problem the product exists to remove. */
export interface ProblemStatement {
  /** The core problem, in the client's own vocabulary. */
  problem: string;
  /** Who actually has it (not "users" — the specific people). */
  whoHasIt: string;
  /** What they do about it today, including "nothing" and "a spreadsheet". */
  currentAlternative: string;
  /** What it costs them to carry on as they are. */
  costOfInaction: string;
}

/** A distinct group of users with its own reason to show up. */
export interface UserSegment {
  name: string;
  description: string;
  /** The job they are hiring this product to do. */
  jobToBeDone: string;
  painPoints: string[];
}

/**
 * A competing product or approach.
 *
 * `confidence` is almost always `unverified` — the model is recalling a market
 * it cannot check. The prompt forbids the specifics that would make a fabricated
 * entry sound authoritative (funding, revenue, headcount, founding dates,
 * customer counts), because those are the details a client would fact-check
 * first and the ones a model invents most fluently.
 */
export interface Competitor {
  name: string;
  /** The category it belongs to, e.g. "general-purpose booking SaaS". */
  category: string;
  /** How it positions itself / who it serves. */
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  confidence: ClaimConfidence;
}

/**
 * Whether there is demand — expressed as signals and headwinds, never as a
 * fabricated market size.
 *
 * There is deliberately **no `marketSizeUsd`**. A number here would be invented,
 * would be the single most quotable line in the document, and would be wrong.
 */
export interface MarketAssessment {
  /** Concrete reasons to believe demand exists. */
  demandSignals: string[];
  /** Concrete reasons it might not, or might be hard to reach. */
  headwinds: string[];
  /** Qualitative shape of the market — crowded, fragmented, nascent, local. */
  sizeNote: string;
  confidence: ClaimConfidence;
}

/** Why a buyer would choose this over the alternatives. */
export interface UniqueSellingProposition {
  /** One sentence a founder could say out loud. */
  statement: string;
  differentiators: string[];
  /** Why a competitor could not trivially copy it — or an honest "they could". */
  defensibility: string;
}

/** Is the proposed first release the right cut? */
export type MvpVerdict = 'well-scoped' | 'too-large' | 'too-thin';

/** The runtime list, so the type and the validator cannot drift apart. */
export const MVP_VERDICTS: readonly MvpVerdict[] = [
  'well-scoped',
  'too-large',
  'too-thin',
];

export interface MvpAssessment {
  verdict: MvpVerdict;
  reasoning: string;
  /** The features that genuinely must be in release one. */
  recommendedCore: string[];
  /** What can wait, and is therefore negotiable in the bid. */
  deferSuggestions: string[];
}

/**
 * The overall read.
 *
 * Note what is **not** here: a `do-not-build`. This product's user is a dev shop
 * scoping a client's project, not an investor deciding whether to fund it — the
 * client has already decided to build. The useful axis is therefore "how much
 * validation does this still need", which is actionable, rather than a verdict
 * on someone else's business that would only ever be delivered by the vendor
 * they are paying to build it.
 */
export type ViabilityVerdict =
  /** Clear problem, plausible demand, sensible MVP. */
  | 'proceed'
  /** Worth building, but the scope or positioning needs a change first. */
  | 'proceed-with-changes'
  /** The core assumptions need checking with real users before committing. */
  | 'needs-validation'
  /** Serious commercial risk the owner should raise with the client. */
  | 'high-risk';

export const VIABILITY_VERDICTS: readonly ViabilityVerdict[] = [
  'proceed',
  'proceed-with-changes',
  'needs-validation',
  'high-risk',
];

export interface BusinessAnalysis {
  sessionId: string;
  generatedAt: string;
  /** How this analysis was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  problem: ProblemStatement;
  segments: UserSegment[];
  competitors: Competitor[];
  market: MarketAssessment;
  usp: UniqueSellingProposition;
  mvp: MvpAssessment;
  verdict: ViabilityVerdict;
  verdictRationale: string;
  /**
   * What the owner must verify before putting any of this in front of a client.
   *
   * This is the counterweight that makes the rest of the artifact honest: the
   * competitor and market sections are the model's recollection, so the document
   * says so out loud and turns its own weakest claims into a to-do list. Never
   * empty when there is an unverified claim anywhere in the analysis.
   */
  researchChecklist: string[];
}

/**
 * Rules embedded verbatim in the analyst's system prompt, and pinned by a test.
 *
 * The R13 `HONESTY_RULES` precedent: when a model's default register would
 * produce confident fabrication, the ban belongs in the prompt as literal text
 * that a test asserts is present — not as a hopeful paraphrase that a later edit
 * can soften without anything failing.
 *
 * Named competitors are permitted because a model does genuinely know the common
 * products in a category. The **specifics** are banned because they are what
 * turn a plausible recollection into an authoritative-sounding fabrication, and
 * they are exactly what a client checks first.
 */
export const MARKET_HONESTY_RULES = [
  'You have NO web access and cannot research anything. Everything you say about',
  'competitors and market conditions is recollection, and you mark it as such.',
  'NEVER state a funding amount, valuation, revenue figure, user or customer',
  'count, employee count, founding date, growth rate, or market size in dollars —',
  'for any company, including the client\'s. You cannot know these and a wrong one',
  'is the first thing a client will catch.',
  'Name a competitor only if you are genuinely recalling a real product in this',
  'category; describe what it does and who it serves, not its business metrics.',
  'If you cannot name real ones, say so and describe the category instead — an',
  'empty competitor list with an honest note beats an invented one.',
  'Every competitor and market claim carries a confidence, and anything you did',
  'not get from the interview is "unverified".',
  'Put every unverified claim the owner should check into researchChecklist.',
].join(' ');

/**
 * Sanitize a model-supplied confidence. Unknown values read as `unverified`
 * rather than being dropped — the cautious direction, since the whole point is
 * that an unmarked outside claim must never pass as established fact.
 */
export function toClaimConfidence(value: unknown): ClaimConfidence {
  return (CLAIM_CONFIDENCES as readonly string[]).includes(value as string)
    ? (value as ClaimConfidence)
    : 'unverified';
}

/** Sanitize a model-supplied verdict, defaulting to the one that asks for proof. */
export function toViabilityVerdict(value: unknown): ViabilityVerdict {
  return (VIABILITY_VERDICTS as readonly string[]).includes(value as string)
    ? (value as ViabilityVerdict)
    : 'needs-validation';
}

/**
 * Sanitize a model-supplied MVP verdict.
 *
 * Unlike its siblings there is no cautious value to fall back to: `too-large`
 * would tell an owner to cut a client's scope on no evidence, and `too-thin`
 * to pad it. `well-scoped` is the only option that asserts no change, so an
 * unrecognized value lands there — and `normalizeMvpAssessment` marks the
 * reasoning as unassessed so the neutral verdict never reads as a judgement
 * the analyst actually made.
 */
export function toMvpVerdict(value: unknown): MvpVerdict {
  return (MVP_VERDICTS as readonly string[]).includes(value as string)
    ? (value as MvpVerdict)
    : 'well-scoped';
}

/** Keep only the strings in a possibly-absent, possibly-not-an-array field. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Coerce a possibly-partial analysis into a complete, safe-to-render shape.
 *
 * **Every array here is REQUIRED by the type, and that is the trap** — the
 * artifact is stored as `data Json` and read back with a cast, and `isValid`
 * only checks that `problem.problem`, `segments` and `usp.statement` exist. A
 * model that returned a segment without `painPoints`, or a `usp` without
 * `differentiators`, flows straight through to the view's `.join()` / `.length`
 * and takes the whole tab out. `?? []` is not enough either: a model that
 * answers `demandSignals: "strong local demand"` passes the nullish check and
 * crashes on `.map`. A missing OR mistyped array must read as empty.
 *
 * The `normalizeApiDesign` convention: one pure helper, called at both
 * boundaries — the agent on write and the store on read, so a row written
 * before this existed is healed rather than left to crash forever.
 */
export function normalizeBusinessAnalysis(analysis: BusinessAnalysis): BusinessAnalysis {
  const problem = analysis.problem ?? ({} as ProblemStatement);
  const usp = analysis.usp ?? ({} as UniqueSellingProposition);

  const normalized: BusinessAnalysis = {
    ...analysis,
    problem: {
      problem: problem.problem ?? '',
      whoHasIt: problem.whoHasIt ?? '',
      currentAlternative: problem.currentAlternative ?? '',
      costOfInaction: problem.costOfInaction ?? '',
    },
    segments: (Array.isArray(analysis.segments) ? analysis.segments : [])
      .filter((s): s is UserSegment => !!s && typeof s.name === 'string')
      .map((s) => ({
        name: s.name,
        description: s.description ?? '',
        jobToBeDone: s.jobToBeDone ?? '',
        painPoints: stringList(s.painPoints),
      })),
    competitors: (Array.isArray(analysis.competitors) ? analysis.competitors : [])
      .filter((c): c is Competitor => !!c && typeof c.name === 'string')
      .map((c) => ({
        name: c.name,
        category: c.category ?? 'unknown',
        positioning: c.positioning ?? '',
        strengths: stringList(c.strengths),
        weaknesses: stringList(c.weaknesses),
        confidence: toClaimConfidence(c.confidence),
      })),
    market: {
      demandSignals: stringList(analysis.market?.demandSignals),
      headwinds: stringList(analysis.market?.headwinds),
      sizeNote: analysis.market?.sizeNote ?? 'Not assessed.',
      confidence: toClaimConfidence(analysis.market?.confidence),
    },
    usp: {
      statement: usp.statement ?? '',
      differentiators: stringList(usp.differentiators),
      defensibility: usp.defensibility ?? '',
    },
    mvp: normalizeMvpAssessment(analysis.mvp),
    verdict: toViabilityVerdict(analysis.verdict),
    verdictRationale: analysis.verdictRationale ?? '',
    researchChecklist: stringList(analysis.researchChecklist),
  };

  return withResearchChecklist(normalized);
}

/** Coerce the MVP block, keeping a defaulted verdict honest about being one. */
export function normalizeMvpAssessment(
  raw: Partial<MvpAssessment> | undefined,
): MvpAssessment {
  const stated = (MVP_VERDICTS as readonly string[]).includes(raw?.verdict as string);
  return {
    verdict: toMvpVerdict(raw?.verdict),
    reasoning:
      raw?.reasoning ??
      (stated ? '' : 'The MVP cut was not assessed — treat this as unreviewed.'),
    recommendedCore: stringList(raw?.recommendedCore),
    deferSuggestions: stringList(raw?.deferSuggestions),
  };
}

/**
 * Guarantee the checklist covers every unverified claim.
 *
 * This is the invariant that keeps the artifact honest: the competitor and
 * market sections are recollection, so the document has to say what needs
 * checking. A model that produced unverified claims and an empty checklist would
 * present a guess as settled — exactly the failure the stage is shaped to avoid.
 */
export function withResearchChecklist(analysis: BusinessAnalysis): BusinessAnalysis {
  const checklist = [...analysis.researchChecklist];
  const add = (item: string) => {
    if (!checklist.some((c) => c.toLowerCase() === item.toLowerCase())) {
      checklist.push(item);
    }
  };

  for (const c of analysis.competitors) {
    if (c.confidence === 'unverified') {
      add(`Confirm ${c.name} is a real competitor here, and check how it is positioned.`);
    }
  }
  if (analysis.market.confidence === 'unverified') {
    add('Verify the market read (demand, competition, saturation) with the client.');
  }
  if (!analysis.competitors.length) {
    add('No competitors were identified — research who else serves these users.');
  }

  return { ...analysis, researchChecklist: checklist };
}

/**
 * Remove the business metrics the prompt bans, in case the model emits one
 * anyway.
 *
 * The prompt is the primary defence; this is the backstop, because a fabricated
 * "$4M raised" or "10,000 customers" is precisely the sentence a client would
 * check and precisely the one that would discredit the whole package. Dropping
 * the clause costs a little fluency and removes a claim we cannot stand behind.
 */
export function stripMetrics(text: string): string {
  return text
    .replace(/\$\s?\d[\d,.]*\s*(m|bn|b|k|million|billion|thousand)?/gi, 'an undisclosed amount')
    .replace(
      /\b\d[\d,.]*\+?\s*(users|customers|clients|employees|staff|seats)\b/gi,
      'a number of $1',
    )
    .replace(/\bfounded in \d{4}\b/gi, 'established')
    .replace(/\braised\s+an undisclosed amount\b/gi, 'raised funding')
    .trim();
}
