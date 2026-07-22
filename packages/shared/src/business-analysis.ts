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

import {
  artifactLanguageOf,
  copyFor,
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
  type LocalizedArtifact,
  type LocalizedCopy,
} from './artifact-language';
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

export interface BusinessAnalysis extends LocalizedArtifact {
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
  /**
   * A hash of the inputs this analysis was derived from (idea, industry, the
   * grounding slots). Lets a re-run recognise "same interview" and reuse the
   * stored competitors and market read instead of churning them — see
   * `businessAnalysisInputsFingerprint` / `carryOverFacts`. Additive/optional
   * (JSON-blob convention, migration-free); absent on pre-existing rows, which
   * simply never match and so always regenerate — the safe direction.
   */
  inputsFingerprint?: string;
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
  'NEVER name a specific law, regulation, act, directive, standard, government',
  'ministry, regulator, agency, or national initiative unless the client named it',
  'in the interview. You have no way to confirm which one applies. Describe the',
  'category instead ("a data-protection regime likely applies", "sector licensing',
  'may be required") and put confirming the specific regime into researchChecklist.',
  'The "unverified" label is NOT permission to invent a specific — a specific you',
  'cannot ground does not belong in the document at all, only in the checklist.',
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
 * The sentences this module composes in CODE, in every language.
 *
 * **This table is the fix for the broken-grammar bug.** The checklist item below
 * used to be one hardcoded English template — `Confirm ${name} is a real
 * competitor here…` — with the competitor's name interpolated into it. Once the
 * analyst started answering in Arabic, the *value* came back Arabic and the
 * sentence around it stayed English, producing a line that read as neither
 * language and that the owner was about to forward to a client.
 *
 * The rule it encodes: **a sentence is localized as a whole sentence.** Never
 * translate a fragment and splice it into fixed prose, and never compose fixed
 * prose around a fragment whose language you do not control. Because the table
 * is `LocalizedCopy`, a language with a missing entry is a compile error rather
 * than a silent English fallback.
 */
const COPY: LocalizedCopy<{
  confirmCompetitor: (name: string) => string;
  verifyMarket: string;
  noCompetitors: string;
  mvpNotAssessed: string;
  marketNotAssessed: string;
  undisclosedAmount: string;
  aNumberOf: (unit: string) => string;
  established: string;
  raisedFunding: string;
  /** Verbs after which "<an undisclosed amount>" collapses to "funding". */
  raisedPrefixes: string[];
  /** The generic that replaces a named-but-ungrounded law/regulation/standard. */
  genericRegulation: string;
  /** The generic that replaces a named-but-ungrounded ministry/regulator/agency. */
  genericAuthority: string;
  /** The generic that replaces a named-but-ungrounded national initiative. */
  genericInitiative: string;
  /** Added to the checklist once any specific was generalized away. */
  confirmSpecifics: string;
}> = {
  en: {
    confirmCompetitor: (name) =>
      `Confirm ${name} is a real competitor here, and check how it is positioned.`,
    verifyMarket:
      'Verify the market read (demand, competition, saturation) with the client.',
    noCompetitors:
      'No competitors were identified — research who else serves these users.',
    mvpNotAssessed: 'The MVP cut was not assessed — treat this as unreviewed.',
    marketNotAssessed: 'Not assessed.',
    undisclosedAmount: 'an undisclosed amount',
    aNumberOf: (unit) => `a number of ${unit}`,
    established: 'established',
    raisedFunding: 'raised funding',
    raisedPrefixes: ['raised'],
    genericRegulation: 'an applicable regulation (confirm the specific regime)',
    genericAuthority: 'the relevant government body (confirm which)',
    genericInitiative: 'a relevant national initiative (confirm which)',
    confirmSpecifics:
      'Confirm the specific laws, regulators and initiatives that apply — the ' +
      'analysis names none it could verify.',
  },
  ar: {
    confirmCompetitor: (name) =>
      `تأكّد من أن ${name} منافس فعلي في هذا السوق، وراجع موقعه التنافسي.`,
    verifyMarket:
      'راجع قراءة السوق (الطلب، المنافسة، درجة الإشباع) مع العميل.',
    noCompetitors:
      'لم يتم تحديد أي منافسين — ابحث عن الجهات الأخرى التي تخدم هؤلاء المستخدمين.',
    mvpNotAssessed:
      'لم يُقيَّم نطاق المنتج الأولي — تعامل معه على أنه غير مراجَع.',
    marketNotAssessed: 'لم يُقيَّم.',
    undisclosedAmount: 'مبلغ غير معلن',
    aNumberOf: (unit) => `عدد من ${arabicPlural(unit)}`,
    established: 'قائمة منذ سنوات',
    raisedFunding: 'حصلت على تمويل',
    // Empty on purpose — see the collapse step in `stripMetrics`.
    raisedPrefixes: [],
    genericRegulation: 'لائحة تنظيمية سارية (يُرجى تأكيد النظام المُحدَّد)',
    genericAuthority: 'الجهة الحكومية المختصة (يُرجى تأكيدها)',
    genericInitiative: 'مبادرة وطنية ذات صلة (يُرجى تأكيدها)',
    confirmSpecifics:
      'أكِّد الأنظمة والجهات التنظيمية والمبادرات المُحدَّدة التي تنطبق — لم يذكر ' +
      'التحليل أيًّا منها ممّا يمكن التحقق منه.',
  },
};

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
  // The artifact's own stamp, not a parameter: this runs at both repository read
  // boundaries as well as at the agent, and only the agent has a session.
  const language = artifactLanguageOf(analysis);
  const copy = copyFor(COPY, language);

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
      sizeNote: analysis.market?.sizeNote ?? copy.marketNotAssessed,
      confidence: toClaimConfidence(analysis.market?.confidence),
    },
    usp: {
      statement: usp.statement ?? '',
      differentiators: stringList(usp.differentiators),
      defensibility: usp.defensibility ?? '',
    },
    mvp: normalizeMvpAssessment(analysis.mvp, language),
    verdict: toViabilityVerdict(analysis.verdict),
    verdictRationale: analysis.verdictRationale ?? '',
    researchChecklist: stringList(analysis.researchChecklist),
  };

  return withResearchChecklist(normalized);
}

/** Coerce the MVP block, keeping a defaulted verdict honest about being one. */
export function normalizeMvpAssessment(
  raw: Partial<MvpAssessment> | undefined,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): MvpAssessment {
  const stated = (MVP_VERDICTS as readonly string[]).includes(raw?.verdict as string);
  return {
    verdict: toMvpVerdict(raw?.verdict),
    reasoning:
      raw?.reasoning ??
      (stated ? '' : copyFor(COPY, language).mvpNotAssessed),
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
  // Read off the artifact rather than taken as a parameter: this runs at BOTH
  // repository read boundaries, where there is no session to ask. An artifact
  // written before the stamp existed reads as English, which is what it is.
  const copy = copyFor(COPY, artifactLanguageOf(analysis));
  const checklist = [...analysis.researchChecklist];
  const add = (item: string) => {
    if (!checklist.some((c) => c.toLowerCase() === item.toLowerCase())) {
      checklist.push(item);
    }
  };

  for (const c of analysis.competitors) {
    if (c.confidence === 'unverified') {
      add(copy.confirmCompetitor(c.name));
    }
  }
  if (analysis.market.confidence === 'unverified') {
    add(copy.verifyMarket);
  }
  if (!analysis.competitors.length) {
    add(copy.noCompetitors);
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
export function stripMetrics(
  text: string,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): string {
  // The replacements go INTO the model's prose, so they have to be in the same
  // language as the sentence they land in. Hardcoding "an undisclosed amount"
  // spliced an English clause into an Arabic competitor description — the same
  // half-and-half sentence the checklist template produced, arriving through the
  // one function whose whole job is to make a sentence safe to forward.
  const copy = copyFor(COPY, language);
  const cleaned = text
    .replace(MONEY, copy.undisclosedAmount)
    .replace(
      COUNTED_UNITS,
      // A function replacement rather than a `'$1'` string: the replacement text
      // is now table data, and `$` is meaningful to `String.replace`. A copy
      // entry that happened to contain `$&` or `$1` would splice matched text
      // into the sentence instead of being written literally.
      (_full, unit: string) => copy.aNumberOf(unit),
    )
    .replace(FOUNDING_YEAR, copy.established)
    .trim();

  // Collapse "raised <an undisclosed amount>" into "raised funding", which is
  // what the sentence was actually saying. Built from the copy table because the
  // phrase it must match is whatever the first replacement just wrote, and that
  // is language-specific.
  //
  // **An empty prefix list means "never run", not "match anything".** Building
  // the alternation unconditionally produced `(?:)\s+مبلغ غير معلن`, whose empty
  // group matches the empty string — so it swallowed the space before the phrase
  // and emitted `جمعتحصلت على تمويل`, two verbs fused into a non-word. Arabic's
  // list is empty on purpose: `جمعت مبلغ غير معلن` already reads naturally, and
  // collapsing it gave "funding" twice in one clause.
  if (copy.raisedPrefixes.length === 0) return cleaned;
  return cleaned
    .replace(
      new RegExp(
        `(?:${copy.raisedPrefixes.map(escapeRegExp).join('|')})\\s+${escapeRegExp(copy.undisclosedAmount)}`,
        'gi',
      ),
      copy.raisedFunding,
    )
    .trim();
}

/**
 * Digit characters, Latin **and** Arabic-Indic.
 *
 * A model writing Arabic uses ٠-٩ freely, and every pattern below matched only
 * `0-9`. That made this entire backstop a no-op the moment the analyst started
 * answering in Arabic: still running, still passing its (English) tests, and no
 * longer removing anything — the worst state for a safety net to be in.
 */
const DIGITS = '0-9٠-٩۰-۹';

/**
 * Thousands / decimal separators, in both conventions.
 *
 * `٬` (U+066C) and `٫` (U+066B) are the Arabic separators. Omitting them split
 * `١٠٬٠٠٠ عميل` in the middle of the number and produced `١٠٬عدد من عميل` — the
 * figure half-removed, which is worse than leaving it alone.
 */
const SEPARATORS = ',.٬٫';

/** A money figure. The currency mark and digits travel; the magnitude words don't. */
const MONEY = new RegExp(
  `[$€£]\\s?[${DIGITS}][${DIGITS}${SEPARATORS}]*\\s*` +
    `(m|bn|b|k|million|billion|thousand|مليون|مليار|ألف|الف)?`,
  'gi',
);

/**
 * A counted business metric — the "10,000 customers" class of claim.
 *
 * The Arabic units matter for the same reason the whole file exists: a customer
 * count is the first thing a client fact-checks, and this one was invented.
 * There is no `\b` around the Arabic alternatives — JavaScript's word boundary
 * is ASCII-only and never fires next to Arabic script, so requiring one would
 * have silently disabled every Arabic branch.
 */
const COUNTED_UNITS = new RegExp(
  `[${DIGITS}][${DIGITS}${SEPARATORS}]*\\+?\\s*` +
    `(users|customers|clients|employees|staff|seats|` +
    `مستخدمين|مستخدمًا|مستخدما|مستخدم|عملاء|عميلًا|عميلا|عميل|` +
    `زبائن|زبون|موظفين|موظفًا|موظفا|موظف|مشتركين|مشتركًا|مشتركا|مشترك)`,
  'gi',
);

/** A founding date, in either script's digits and either language's phrasing. */
const FOUNDING_YEAR = new RegExp(
  `(?:\\bfounded in|تأسّست عام|تأسست عام|تأسّست في|تأسست في)\\s*[${DIGITS}]{4}`,
  'gi',
);

/**
 * The definite plural for each unit `COUNTED_UNITS` can capture.
 *
 * Arabic requires a definite plural after `عدد من`, so interpolating the noun as
 * the model wrote it produced `عدد من عميل` — "a number of customer". The set is
 * closed (this map and that pattern are the same list), and Arabic plurals are
 * irregular enough that deriving one is not an option. An unrecognized unit is
 * returned untouched rather than mangled: the English units reaching here belong
 * to an English sentence, where the code never runs.
 */
function arabicPlural(unit: string): string {
  return ARABIC_PLURALS[unit] ?? unit;
}

const ARABIC_PLURALS: Record<string, string> = {
  مستخدم: 'المستخدمين',
  مستخدمًا: 'المستخدمين',
  مستخدما: 'المستخدمين',
  مستخدمين: 'المستخدمين',
  عميل: 'العملاء',
  عميلًا: 'العملاء',
  عميلا: 'العملاء',
  عملاء: 'العملاء',
  زبون: 'الزبائن',
  زبائن: 'الزبائن',
  موظف: 'الموظفين',
  موظفًا: 'الموظفين',
  موظفا: 'الموظفين',
  موظفين: 'الموظفين',
  مشترك: 'المشتركين',
  مشتركًا: 'المشتركين',
  مشتركا: 'المشتركين',
  مشتركين: 'المشتركين',
};

/**
 * Escape a string for literal use inside a `RegExp`.
 *
 * The copy table is data, and one of its entries is now compiled into a pattern.
 * Without this a translation containing a regex metacharacter would either throw
 * at module load or match something nobody intended — the same rule that keeps
 * `basePath` out of a constructed RegExp in the API designer.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── ungrounded named specifics (laws, regulators, initiatives) ───────────────

/**
 * The regulation acronyms a model reaches for by default.
 *
 * A CLOSED allowlist, not a general uppercase-token rule: `SaaS`, `API`, `CRM`,
 * `EHR`, `MVP` are all uppercase and legitimate, so a blanket "strip acronyms"
 * would gut the document. Case-sensitive — these are always written uppercase,
 * and matching case-insensitively would catch the common word "sox" and the like.
 */
const REGULATION_ACRONYMS = [
  'GDPR', 'HIPAA', 'CCPA', 'CPRA', 'PDPL', 'PIPL', 'LGPD', 'POPIA', 'NDPR',
  'FERPA', 'GLBA', 'COPPA', 'SOX', 'PSD2', 'DORA', 'eIDAS', 'FedRAMP', 'FISMA',
  'PCI DSS', 'PCI-DSS', 'SOC 2', 'SOC2', 'ISO 27001', 'ISO27001', 'NIST 800-53',
];

const ACRONYM_RE = new RegExp(`\\b(${REGULATION_ACRONYMS.map(escapeRegExp).join('|')})\\b`, 'g');

/** "the Data Protection Act", "the Consumer Protection Law" — captures the name. */
const NAMED_LAW_RE =
  /\bthe\s+([A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+){0,4})\s+(?:Act|Law|Decree|Directive|Ordinance|Statute|Code)\b/g;

/** "Law No. 25", "Royal Decree No. M/19", "Regulation (EU) 2016/679". */
const NUMBERED_LAW_RE =
  /\b(?:Royal\s+Decree|Decree|Law|Regulation|Directive|Act)\s+(?:No\.?\s*)?(?:\([A-Z]{2,}\)\s*)?[MмA-Z]?\/?\s*\d[\d/-]*\b/g;

/** "Ministry of Health", "Department for Digital". */
const MINISTRY_OF_RE =
  /\b(?:Ministry|Department|Directorate|Authority|Commission|Agency)\s+(?:of|for)\s+([A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+){0,3})/g;

/** "Saudi Data & AI Authority", "Federal Trade Commission" — the name leads. */
const NAMED_BODY_RE =
  /\b([A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+){0,4})\s+(?:Ministry|Authority|Commission|Regulator|Directorate)\b/g;

/**
 * Common-noun heads that precede Authority/Commission/etc. and are NOT proper
 * names — "local authority", "certificate authority", "public commission". A
 * single distinctive proper noun is not enough to fire when it is one of these.
 */
const BODY_STOPWORDS = new Set([
  'local', 'certificate', 'public', 'the', 'a', 'an', 'central', 'higher',
  'relevant', 'appropriate', 'competent', 'national', 'federal', 'state',
]);

/** "Vision 2030", "Vision 2071" — a national initiative keyed to a year. */
const INITIATIVE_RE = /\bVision\s+\d{4}\b/g;

/** Arabic: "وزارة الصحة" (Ministry of X), "هيئة الاتصالات" (X Authority). */
const ARABIC_BODY_RE = /(?:وزارة|هيئة|الهيئة)\s+[^\s،.]+(?:\s+[^\s،.]+){0,2}/g;

/** Arabic: "رؤية ٢٠٣٠" / "رؤية 2030". */
const ARABIC_INITIATIVE_RE = /رؤية\s*[\d٠-٩]{4}/g;

/** The distinctive words of a phrase, lowercased — proper nouns and acronyms. */
function distinctiveTokens(phrase: string): string[] {
  return (phrase.match(/[A-Za-z٠-٩؀-ۿ][\w؀-ۿ&/-]{1,}/g) ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2);
}

/**
 * True when every distinctive word of a matched specific also appears in what the
 * client actually said. Containment, not overlap — the `namesExcludedCapability`
 * bar: a specific the client named ("we must meet PDPL") is grounded and survives;
 * one the model supplied is not. A match with no distinctive words (a bare
 * numbered decree) is never grounded, which is correct — the client did not state
 * a decree number we cannot see.
 */
function isGrounded(match: string, groundingLower: string): boolean {
  const tokens = distinctiveTokens(match);
  const nameTokens = tokens.filter((t) => !/^\d/.test(t));
  if (!nameTokens.length) return false;
  return nameTokens.every((t) => groundingLower.includes(t));
}

/**
 * Generalize named laws, regulators and national initiatives the model could not
 * have grounded — the backstop for when the honesty prompt does not hold.
 *
 * The prompt is the primary defence (see `MARKET_HONESTY_RULES`); this is the
 * `stripMetrics` sibling for named specifics rather than numeric ones. It runs at
 * the AGENT only, never at the repository read boundary, because it needs the
 * interview text to decide groundedness and only the agent has it — the same
 * reason `stripMetrics` is a write-side backstop.
 *
 * Conservative by construction, because a false positive silently deletes the
 * client's own words: acronyms are a closed allowlist, government bodies must
 * carry a proper-noun head that is not a common-noun stopword, and anything the
 * interview actually mentions is kept verbatim.
 */
export function stripUngroundedSpecifics(
  text: string,
  grounding: string,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): { text: string; changed: boolean } {
  if (!text) return { text, changed: false };
  const copy = copyFor(COPY, language);
  const groundingLower = grounding.toLowerCase();
  let changed = false;

  const generalize = (re: RegExp, replacement: string) => {
    text = text.replace(re, (match, ...rest) => {
      // The captured proper-noun group, when the pattern has one, is the tighter
      // groundedness signal; else the whole match.
      const captured = typeof rest[0] === 'string' ? rest[0] : match;
      if (isGrounded(captured, groundingLower)) return match;
      // The body patterns fire on a leading proper noun; hold fire when that noun
      // is a generic head ("local authority") rather than a real name.
      if (re === NAMED_BODY_RE && BODY_STOPWORDS.has(captured.toLowerCase())) {
        return match;
      }
      changed = true;
      return replacement;
    });
  };

  generalize(ACRONYM_RE, copy.genericRegulation);
  generalize(NAMED_LAW_RE, copy.genericRegulation);
  generalize(NUMBERED_LAW_RE, copy.genericRegulation);
  generalize(MINISTRY_OF_RE, copy.genericAuthority);
  generalize(NAMED_BODY_RE, copy.genericAuthority);
  generalize(INITIATIVE_RE, copy.genericInitiative);
  generalize(ARABIC_BODY_RE, copy.genericAuthority);
  generalize(ARABIC_INITIATIVE_RE, copy.genericInitiative);

  return { text: text.replace(/\s{2,}/g, ' ').trim(), changed };
}

/**
 * Apply `stripUngroundedSpecifics` across every free-prose field of the analysis
 * that a client reads, and record — once — that specifics were generalized.
 *
 * The market read and the verdict rationale are where a fabricated statute or
 * ministry actually surfaces; the competitor prose is where an invented
 * "regulated by X" creeps in. When anything is generalized, the checklist gains a
 * line telling the owner to confirm the specifics, so the document never quietly
 * swaps a named law for a vague one and leaves no trace — the honesty the whole
 * stage is built on.
 */
export function screenUngroundedSpecifics(
  analysis: BusinessAnalysis,
  grounding: string,
): BusinessAnalysis {
  const language = artifactLanguageOf(analysis);
  const copy = copyFor(COPY, language);
  let any = false;
  const scrub = (value: string): string => {
    const { text, changed } = stripUngroundedSpecifics(value, grounding, language);
    if (changed) any = true;
    return text;
  };
  const scrubList = (values: string[]): string[] => values.map(scrub);

  const screened: BusinessAnalysis = {
    ...analysis,
    competitors: analysis.competitors.map((c) => ({
      ...c,
      positioning: scrub(c.positioning),
      strengths: scrubList(c.strengths),
      weaknesses: scrubList(c.weaknesses),
    })),
    market: {
      ...analysis.market,
      demandSignals: scrubList(analysis.market.demandSignals),
      headwinds: scrubList(analysis.market.headwinds),
      sizeNote: scrub(analysis.market.sizeNote),
    },
    verdictRationale: scrub(analysis.verdictRationale),
  };

  if (any) {
    const has = screened.researchChecklist.some(
      (c) => c.toLowerCase() === copy.confirmSpecifics.toLowerCase(),
    );
    if (!has) {
      screened.researchChecklist = [...screened.researchChecklist, copy.confirmSpecifics];
    }
  }
  return screened;
}

// ── fact stability across re-runs ────────────────────────────────────────────

/**
 * The inputs a business analysis is derived from, reduced to a stable string.
 *
 * Re-running the analysis on the SAME interview must not churn the competitor
 * names and regulatory claims — those are the client-facing facts, and a document
 * whose "facts" reshuffle every time it is regenerated is not one an owner can
 * stand behind. The fingerprint is how a re-run recognises "same inputs" and
 * reuses the stored facts (see `carryOverFacts`); only the framing is allowed to
 * vary. Fields are listed explicitly and in order so the hash is stable across
 * runs and process restarts.
 */
export function businessAnalysisInputsFingerprint(input: {
  idea?: string;
  industry?: string;
  domain?: string;
  goal?: string;
  features?: string[];
  slots?: Record<string, string>;
}): string {
  const parts = [
    input.idea ?? '',
    input.industry ?? '',
    input.domain ?? '',
    input.goal ?? '',
    (input.features ?? []).join('|'),
    Object.keys(input.slots ?? {})
      .sort()
      .map((k) => `${k}=${input.slots?.[k] ?? ''}`)
      .join('|'),
  ];
  return fnv1a(parts.join(' '));
}

/** FNV-1a, 32-bit, hex. A tiny stable hash — no crypto dep in runtime-free code. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Reuse the researched FACTS from a previous analysis, keeping the fresh framing.
 *
 * This is the "reuse facts, re-vary framing" rule made structural: rather than
 * trust the model to reproduce the same competitors on a re-run (it will not,
 * even at temperature 0 — batched inference is not bit-deterministic), the
 * service pins the facts in CODE. Competitors and the market read come from the
 * previous run; the problem/segments/USP/verdict/MVP framing comes from the new
 * one. The checklist is re-derived so it matches the pinned facts.
 *
 * Only called when the inputs fingerprint matches — different inputs are a
 * different project and must be researched afresh.
 */
export function carryOverFacts(
  fresh: BusinessAnalysis,
  previous: BusinessAnalysis,
): BusinessAnalysis {
  return normalizeBusinessAnalysis({
    ...fresh,
    competitors: previous.competitors,
    market: previous.market,
  });
}

/** One factual difference between two runs, for the re-run log. */
export interface BusinessAnalysisFactDiff {
  competitorsAdded: string[];
  competitorsRemoved: string[];
  marketSignalsChanged: boolean;
  /** True when nothing factual moved — the stability the caching exists to give. */
  stable: boolean;
}

/**
 * Diff the FACTUAL sections of two analyses (competitor names, market signals).
 *
 * Surfaces what changed on a re-run instead of silently replacing one set of
 * unverified claims with another. When facts were reused this is `stable: true`,
 * which is the proof the reuse worked; when the inputs changed (or a facts
 * refresh was forced) it names exactly which competitors and signals moved.
 */
export function diffBusinessAnalysisFacts(
  previous: BusinessAnalysis | null,
  next: BusinessAnalysis,
): BusinessAnalysisFactDiff {
  const prevNames = new Set((previous?.competitors ?? []).map((c) => c.name.toLowerCase()));
  const nextNames = new Set(next.competitors.map((c) => c.name.toLowerCase()));
  const competitorsAdded = next.competitors
    .filter((c) => !prevNames.has(c.name.toLowerCase()))
    .map((c) => c.name);
  const competitorsRemoved = (previous?.competitors ?? [])
    .filter((c) => !nextNames.has(c.name.toLowerCase()))
    .map((c) => c.name);
  const signal = (a: MarketAssessment | undefined) =>
    [...(a?.demandSignals ?? []), ...(a?.headwinds ?? []), a?.sizeNote ?? '']
      .join('||')
      .toLowerCase();
  const marketSignalsChanged = signal(previous?.market) !== signal(next.market);
  return {
    competitorsAdded,
    competitorsRemoved,
    marketSignalsChanged,
    stable:
      !competitorsAdded.length && !competitorsRemoved.length && !marketSignalsChanged,
  };
}
