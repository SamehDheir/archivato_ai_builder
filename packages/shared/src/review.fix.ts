/**
 * **R11 — review findings → actionable fixes.** Pure and runtime-free, so the API
 * classifies/validates/applies with it and the web previews with the same code.
 *
 * The problem it solves: R10 gave the review a deal-risk lens and a
 * `suggestedResolution` per client-readiness finding, but resolution stayed
 * *manual prose* — the owner read "tighten this requirement" and went and did it
 * by hand, in another tab, from memory. The findings that were most worth acting
 * on were the ones least likely to be acted on.
 *
 * Four rules hold this together. None of them is incidental:
 *
 * 1. **No silent auto-fix.** Every mutation is proposed → previewed → explicitly
 *    approved → applied. There is deliberately no "fix all" that writes. The
 *    artifacts are what a dev shop sends a client and prices a bid from; a wrong
 *    word costs real money, so the model may *draft*, never *decide*.
 *
 * 2. **Targeted patches, never full-stage regeneration.** A patch rewrites one
 *    named section of one artifact. Downstream consistency is the EXISTING
 *    staleness system's job (`freshness.ts`): a patch moves the artifact's
 *    `generatedAt`, the derived stages' `sourceStamp`s stop matching, and the
 *    already-built `StaleNotice` offers a one-click regenerate. No new cascade.
 *
 * 3. **A patchable section must fit in ONE model response, and be self-contained.**
 *    This is what closes `PATCH_SECTIONS` (below) — see the note there. It is also
 *    why `api-design.modules` is not patchable: that artifact provably does not fit
 *    (the API designer chunks its own generation at 4 entities per call precisely
 *    because the default output ceiling is 2048 tokens).
 *
 * 4. **Malformed patch ⇒ no patch.** Every other agent here has a deterministic
 *    fallback, because a templated artifact beats no artifact. A *patch* is the
 *    opposite: a guessed rewrite of a client-facing document is worse than an
 *    honest "couldn't generate a fix". `validateFixProposal` is strict and there is
 *    no fallback path.
 */

import type {
  BusinessRule,
  FunctionalRequirement,
  NonFunctionalRequirement,
  OutOfScopeItem,
  RequirementAssumption,
  RequirementDocument,
  UserRole,
} from './requirements';
import type {
  ConstraintCompliance,
  SystemDesign,
  TechChoice,
} from './system-design';
import type {
  ClientReadinessFinding,
  FindingActionType,
  FindingStatus,
  PatchableStage,
  PatchTarget,
  ReviewFinding,
  ReviewReport,
  SuggestedResolution,
} from './review';
import { dedupeBy } from './collections';

// ── Finding identity ────────────────────────────────────────────────────────

/**
 * The finding arrays on a report, keyed by the prefix their ids carry. The key
 * order is fixed so ids are deterministic: the same report always yields the same
 * ids, which is what lets the read boundary assign them to a pre-R11 row instead
 * of leaving old reports permanently unactionable.
 */
export const FINDING_SECTIONS = {
  security: 'securityIssues',
  scalability: 'scalabilityIssues',
  performance: 'performanceRisks',
  cost: 'costOptimizations',
  clientReadiness: 'clientReadinessIssues',
  consistency: 'consistencyFindings',
} as const;

export type FindingSectionKey = keyof typeof FINDING_SECTIONS;

export const FINDING_SECTION_KEYS = Object.keys(
  FINDING_SECTIONS,
) as FindingSectionKey[];

/** A finding's id: its section plus its position in that section. */
export function findingId(section: FindingSectionKey, index: number): string {
  return `${section}:${index}`;
}

// ── Patchable sections (the closed set) ─────────────────────────────────────

/**
 * The artifact sections a patch may rewrite. **Closed on purpose**, by one test:
 * a section qualifies only if a model can regenerate the whole of it in a single
 * response AND it is self-contained enough that rewriting it can't silently
 * invalidate its neighbours.
 *
 * What that excludes, and why it is not an oversight:
 *
 * - **`api-design.modules`** — the largest artifact in the pipeline. Its own
 *   generator chunks at 4 entities per call because a 10-entity design does not
 *   fit the 2048-token ceiling; a "patch" that regenerates it would truncate, and
 *   a truncated API design either fails to parse or — worse — parses *short*,
 *   silently dropping endpoints.
 * - **`system-design.services`** — rewriting the service list moves module
 *   complexity, build-vs-buy, and the effort estimate the price is built from.
 *   That is a re-architecture, not a patch; it belongs in chat refine.
 * - **`database-design.*`** — an entity change cascades into the API design, the
 *   SQL export, and the scaffold. Same reasoning, larger blast radius.
 *
 * Findings that would land there classify as `advisory`: the owner is told what is
 * wrong and left to drive it, which is honest. Widening this set means proving the
 * new section passes both halves of the test — not just adding a key.
 */
export type PatchSectionKey =
  | 'requirements.executiveSummary'
  | 'requirements.functional'
  | 'requirements.nonFunctional'
  | 'requirements.roles'
  | 'requirements.businessRules'
  | 'requirements.constraints'
  | 'requirements.outOfScope'
  | 'requirements.assumptionsAndOpenQuestions'
  | 'system-design.techStack'
  | 'system-design.constraintCompliance';

interface PatchSectionSpec {
  stage: PatchableStage;
  /** The artifact field this section rewrites. */
  field: string;
  /** Strict shape check on the model's `proposedContent`. No coercion. */
  validate: (value: unknown) => boolean;
}

// Small, local guards. Deliberately strict: a patch is a rewrite of a document a
// client reads, so a half-valid array is rejected, never repaired.
const isText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isTextArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(isText);

function isArrayOf<T>(v: unknown, guard: (x: unknown) => boolean): v is T[] {
  return Array.isArray(v) && v.length > 0 && v.every(guard);
}

/** A record with every listed key present as non-empty text. */
function hasText(value: unknown, keys: string[]): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => isText(record[key]));
}

const isFunctional = (v: unknown): boolean =>
  hasText(v, ['id', 'title', 'description']) &&
  ['must', 'should', 'could'].includes(
    (v as FunctionalRequirement).priority as string,
  );

const isNonFunctional = (v: unknown): boolean =>
  hasText(v, ['id', 'category', 'description']);

const isRole = (v: unknown): boolean =>
  hasText(v, ['name', 'description']) &&
  Array.isArray((v as UserRole).permissions) &&
  (v as UserRole).permissions.every(isText);

const isBusinessRule = (v: unknown): boolean => hasText(v, ['id', 'description']);

const isOutOfScope = (v: unknown): boolean => {
  if (!hasText(v, ['item'])) return false;
  const reason = (v as OutOfScopeItem).reason;
  return reason === undefined || typeof reason === 'string';
};

const isAssumption = (v: unknown): boolean =>
  hasText(v, ['assumption', 'impactIfWrong']);

const isTechChoice = (v: unknown): boolean =>
  hasText(v, ['layer', 'technology', 'rationale']);

const isCompliance = (v: unknown): boolean =>
  hasText(v, ['constraint', 'howAddressed']);

export const PATCH_SECTIONS: Readonly<Record<PatchSectionKey, PatchSectionSpec>> =
  {
    'requirements.executiveSummary': {
      stage: 'requirements',
      field: 'executiveSummary',
      validate: isText,
    },
    'requirements.functional': {
      stage: 'requirements',
      field: 'functional',
      validate: (v) => isArrayOf<FunctionalRequirement>(v, isFunctional),
    },
    'requirements.nonFunctional': {
      stage: 'requirements',
      field: 'nonFunctional',
      validate: (v) => isArrayOf<NonFunctionalRequirement>(v, isNonFunctional),
    },
    'requirements.roles': {
      stage: 'requirements',
      field: 'roles',
      validate: (v) => isArrayOf<UserRole>(v, isRole),
    },
    'requirements.businessRules': {
      stage: 'requirements',
      field: 'businessRules',
      validate: (v) => isArrayOf<BusinessRule>(v, isBusinessRule),
    },
    'requirements.constraints': {
      stage: 'requirements',
      field: 'constraints',
      validate: isTextArray,
    },
    'requirements.outOfScope': {
      stage: 'requirements',
      field: 'outOfScope',
      validate: (v) => isArrayOf<OutOfScopeItem>(v, isOutOfScope),
    },
    'requirements.assumptionsAndOpenQuestions': {
      stage: 'requirements',
      field: 'assumptionsAndOpenQuestions',
      validate: (v) => isArrayOf<RequirementAssumption>(v, isAssumption),
    },
    'system-design.techStack': {
      stage: 'system-design',
      field: 'techStack',
      validate: (v) => isArrayOf<TechChoice>(v, isTechChoice),
    },
    'system-design.constraintCompliance': {
      stage: 'system-design',
      field: 'constraintCompliance',
      validate: (v) => isArrayOf<ConstraintCompliance>(v, isCompliance),
    },
  };

export const PATCH_SECTION_KEYS = Object.keys(
  PATCH_SECTIONS,
) as PatchSectionKey[];

export function isPatchSectionKey(value: string): value is PatchSectionKey {
  return Object.prototype.hasOwnProperty.call(PATCH_SECTIONS, value);
}

/** The `{stage, sectionHint}` a section key denotes — read off the spec, not parsed. */
export function patchTargetFor(key: PatchSectionKey): PatchTarget {
  const spec = PATCH_SECTIONS[key];
  return { stage: spec.stage, sectionHint: spec.field };
}

/** The `PatchSectionKey` a target names, or null when it isn't patchable. */
export function patchSectionKeyFor(
  target: PatchTarget | undefined,
): PatchSectionKey | null {
  if (!target) return null;
  const key = `${target.stage}.${target.sectionHint}`;
  return isPatchSectionKey(key) ? key : null;
}

// ── Classification ──────────────────────────────────────────────────────────

/** What can be done about a finding: the action plus, for a patch, where it lands. */
export interface FindingAction {
  actionType: FindingActionType;
  patchTarget?: PatchTarget;
}

const ADVISORY: FindingAction = { actionType: 'advisory' };

function patchAt(stage: PatchableStage, sectionHint: string): FindingAction {
  return { actionType: 'patch', patchTarget: { stage, sectionHint } };
}

/**
 * R10's `suggestedResolution` → an R11 action. This mapping is the reason R11 is
 * additive rather than a redesign: the reviewer already sorts client-readiness
 * findings into exactly these four buckets, and each one already implies both who
 * resolves it and where.
 *
 * The two `needs_client` resolutions carry no patch target on purpose — nobody can
 * draft an answer only the client has. They convert to a question or an
 * out-of-scope line instead, with no LLM call at all.
 */
export const RESOLUTION_ACTION: Readonly<
  Record<SuggestedResolution, FindingAction>
> = {
  add_open_question: { actionType: 'needs_client' },
  add_out_of_scope: { actionType: 'needs_client' },
  tighten_requirement: patchAt('requirements', 'functional'),
  align_summary: patchAt('requirements', 'executiveSummary'),
};

/**
 * The deterministic default for an engineering finding, by dimension — used when
 * the model omits an `actionType`, and as the classification for the whole
 * offline/fallback path.
 *
 * Each default is the section where the fix is actually *written down*, which is
 * not always the dimension's own artifact: a security finding is nearly always a
 * missing security NFR, so it lands on `requirements.nonFunctional` rather than
 * on a design the review can't safely rewrite.
 *
 * `cost` is `advisory` by design. Cost findings ("right-size compute", "add a
 * cache") are operational advice about infrastructure — there is no artifact
 * section that states them, so there is nothing to patch, and inventing an NFR to
 * hold one would put words in the client's document that nobody asked for.
 */
export const DIMENSION_ACTION: Readonly<Record<string, FindingAction>> = {
  security: patchAt('requirements', 'nonFunctional'),
  scalability: patchAt('system-design', 'techStack'),
  performance: patchAt('system-design', 'techStack'),
  cost: ADVISORY,
  consistency: ADVISORY,
};

/**
 * Resolve a finding's action: an explicit, *valid* classification wins; otherwise
 * the section default; otherwise advisory.
 *
 * Backfill tolerance is the point (§1). A pre-R11 report carries no `actionType`
 * at all, and a model can emit one that names a section outside `PATCH_SECTIONS`.
 * Both degrade to the section default, and a `patch` whose target isn't actually
 * patchable degrades to `advisory` — never to a patch aimed at a section with no
 * validator and no applier behind it.
 */
export function resolveFindingAction(
  finding: ReviewFinding,
  section: FindingSectionKey,
): FindingAction {
  const fallback =
    section === 'clientReadiness'
      ? RESOLUTION_ACTION[
          (finding as ClientReadinessFinding).suggestedResolution
        ] ?? ADVISORY
      : DIMENSION_ACTION[section] ?? ADVISORY;

  const declared = finding.actionType;
  if (declared !== 'patch' && declared !== 'needs_client' && declared !== 'advisory') {
    return fallback;
  }
  if (declared === 'patch') {
    // A patch is only a patch if something can actually apply it.
    const target = finding.patchTarget ?? fallback.patchTarget;
    return patchSectionKeyFor(target)
      ? { actionType: 'patch', patchTarget: target }
      : ADVISORY;
  }
  return { actionType: declared };
}

/**
 * Give every finding an id, a resolved action, and a status — the R11 shape.
 *
 * Called at **both** boundaries: the reviewer agent on write, and the store on
 * read. That is the standing rule for a JSON-persisted artifact here, and it is
 * not belt-and-braces: a write-side normalize can never reach a row that is
 * already in the table, and `row.data as ReviewReport` is a *claim*, not a check.
 * Without the read side, every review generated before R11 would render with no
 * action buttons forever.
 *
 * Pure — it returns a new report and never mutates its input.
 */
export function normalizeReviewReport(report: ReviewReport): ReviewReport {
  const next = { ...report };
  for (const section of FINDING_SECTION_KEYS) {
    const field = FINDING_SECTIONS[section];
    const raw = (report[field] ?? []) as ReviewFinding[];
    if (!Array.isArray(raw)) continue;
    // Dedupe by title within the section: a repeated finding would list the same
    // risk twice, and the index-based ids below are then assigned on the deduped
    // list so they stay sequential.
    const findings = dedupeBy(raw, (f) => f.title ?? '');
    (next as Record<string, unknown>)[field] = findings.map((finding, index) => {
      const action = resolveFindingAction(finding, section);
      return {
        ...finding,
        id: finding.id ?? findingId(section, index),
        actionType: action.actionType,
        // Drop a stale target when the resolved action isn't a patch, so the UI
        // can trust `actionType` alone.
        patchTarget: action.actionType === 'patch' ? action.patchTarget : undefined,
        status: finding.status ?? 'open',
      };
    });
  }
  return next;
}

/** Every finding on a report, paired with the section it came from. */
export function allFindings(
  report: ReviewReport,
): { section: FindingSectionKey; finding: ReviewFinding }[] {
  const out: { section: FindingSectionKey; finding: ReviewFinding }[] = [];
  for (const section of FINDING_SECTION_KEYS) {
    const findings = (report[FINDING_SECTIONS[section]] ?? []) as ReviewFinding[];
    if (!Array.isArray(findings)) continue;
    for (const finding of findings) out.push({ section, finding });
  }
  return out;
}

/** Find one finding by id across every section. */
export function findFindingById(
  report: ReviewReport,
  id: string,
): ReviewFinding | null {
  return allFindings(report).find((f) => f.finding.id === id)?.finding ?? null;
}

/** A copy of the report with one finding's status changed. Pure. */
export function withFindingStatus(
  report: ReviewReport,
  id: string,
  status: FindingStatus,
  note?: string,
): ReviewReport {
  const next = { ...report };
  for (const section of FINDING_SECTION_KEYS) {
    const field = FINDING_SECTIONS[section];
    const findings = (report[field] ?? []) as ReviewFinding[];
    if (!Array.isArray(findings)) continue;
    (next as Record<string, unknown>)[field] = findings.map((finding) =>
      finding.id === id
        ? { ...finding, status, ...(note ? { statusNote: note } : {}) }
        : finding,
    );
  }
  return next;
}

// ── The patch contract ──────────────────────────────────────────────────────

/** One section of an artifact, rewritten. The unit of a proposal. */
export interface PatchSection {
  /** Which section this rewrites. Must be a key of `PATCH_SECTIONS`. */
  key: PatchSectionKey;
  /** A human-readable line describing what is there now (for the preview). */
  beforeSummary: string;
  /** The replacement value for the section's field. Shape-checked per section. */
  proposedContent: unknown;
  /** Why this change fixes the finding — shown to the owner before they approve. */
  rationale: string;
  /**
   * The section's **actual** current value, read off the artifact by the service —
   * never supplied by the model. The owner approves a change based on the
   * before/after they are shown, so the "before" has to be the real document; a
   * model paraphrasing what it thinks is there could get approval for a diff that
   * doesn't exist. `beforeSummary` stays the model's prose line *about* it.
   */
  currentContent?: unknown;
}

/** A drafted fix for one or more findings, awaiting explicit approval. */
export interface FixProposal {
  /** The findings this proposal resolves. */
  findingIds: string[];
  sections: PatchSection[];
}

/** Why a proposal was rejected. `conflict` forces the per-finding flow. */
export type FixProposalError =
  | 'malformed'
  | 'unknown_section'
  | 'invalid_content'
  | 'conflict';

export type FixProposalResult =
  | { ok: true; proposal: FixProposal }
  | { ok: false; error: FixProposalError; detail: string };

/**
 * Section keys targeted more than once. A batch may not contain two patches for
 * the same section: each `proposedContent` is a **whole-section replacement**
 * drafted without knowledge of the other, so applying both would not merge them —
 * the second would silently erase the first, and the owner would have approved a
 * preview showing changes that never landed. Detected, not merged; the UI drops
 * to the per-finding flow.
 */
export function findSectionConflicts(sections: PatchSection[]): PatchSectionKey[] {
  const seen = new Set<string>();
  const clashed = new Set<PatchSectionKey>();
  for (const section of sections) {
    if (seen.has(section.key)) clashed.add(section.key);
    seen.add(section.key);
  }
  return [...clashed];
}

/**
 * Validate an untrusted proposal (LLM JSON) against the contract. Strict by
 * design — see rule 4 in the file header. Never coerces, never drops a bad
 * section to salvage the rest: a partially-applied fix is a document nobody
 * reviewed.
 */
export function validateFixProposal(
  raw: unknown,
  findingIds: string[],
): FixProposalResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'malformed', detail: 'Response was not an object.' };
  }
  const sections = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    return { ok: false, error: 'malformed', detail: 'No patch sections returned.' };
  }

  const validated: PatchSection[] = [];
  for (const entry of sections) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'malformed', detail: 'A section was not an object.' };
    }
    const section = entry as Record<string, unknown>;
    const key = section.key;
    if (typeof key !== 'string' || !isPatchSectionKey(key)) {
      return {
        ok: false,
        error: 'unknown_section',
        detail: `"${String(key)}" is not a patchable section.`,
      };
    }
    if (!PATCH_SECTIONS[key].validate(section.proposedContent)) {
      return {
        ok: false,
        error: 'invalid_content',
        detail: `The content proposed for ${key} does not match its shape.`,
      };
    }
    if (!isText(section.rationale)) {
      return {
        ok: false,
        error: 'malformed',
        detail: `The patch for ${key} carries no rationale.`,
      };
    }
    validated.push({
      key,
      beforeSummary: isText(section.beforeSummary) ? section.beforeSummary : '',
      proposedContent: section.proposedContent,
      rationale: section.rationale,
    });
  }

  const conflicts = findSectionConflicts(validated);
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: 'conflict',
      detail: `Two patches target ${conflicts.join(', ')}.`,
    };
  }

  return { ok: true, proposal: { findingIds, sections: validated } };
}

// ── Appliers ────────────────────────────────────────────────────────────────

/** The sections of a proposal that write a given stage. */
export function sectionsForStage(
  sections: PatchSection[],
  stage: PatchableStage,
): PatchSection[] {
  return sections.filter((s) => PATCH_SECTIONS[s.key].stage === stage);
}

/** The distinct stages a proposal touches. */
export function stagesTouched(sections: PatchSection[]): PatchableStage[] {
  return [...new Set(sections.map((s) => PATCH_SECTIONS[s.key].stage))];
}

/**
 * Apply a proposal's sections onto an artifact by overwriting each named field.
 * Pure. `generatedAt` is deliberately NOT touched here — the caller stamps it, so
 * that the one thing which triggers the staleness system stays visible at the
 * write site rather than buried in a helper.
 */
function applySections<T extends object>(artifact: T, sections: PatchSection[]): T {
  const next = { ...artifact } as Record<string, unknown>;
  for (const section of sections) {
    next[PATCH_SECTIONS[section.key].field] = section.proposedContent;
  }
  return next as T;
}

export function applyRequirementsPatch(
  doc: RequirementDocument,
  sections: PatchSection[],
): RequirementDocument {
  return applySections(doc, sectionsForStage(sections, 'requirements'));
}

export function applySystemDesignPatch(
  design: SystemDesign,
  sections: PatchSection[],
): SystemDesign {
  return applySections(design, sectionsForStage(sections, 'system-design'));
}

// ── needs_client conversions ────────────────────────────────────────────────

/**
 * The slot a review-derived client question is filed under. Review findings are
 * about the *documents*, not about a gap in the interview's slot catalog, so
 * there is rarely a real slot to name — `constraints` is the honest catch-all, and
 * `OpenQuestion.slotKey` is typed as a plain string precisely because it is a
 * label here, not a key anything dispatches on.
 */
export const REVIEW_QUESTION_SLOT = 'constraints';

/**
 * A first draft of the question to forward to the client. The owner edits it
 * before confirming — this only exists so they start from a sentence rather than
 * an empty box. `resolutionHint` is preferred when present: R10 wrote it to be
 * read by a person.
 */
export function draftClientQuestion(finding: ReviewFinding): string {
  const hint = (finding as ClientReadinessFinding).resolutionHint;
  return isText(hint) ? hint : finding.title;
}

/**
 * A first draft of the excluded capability, for the owner to edit.
 *
 * The item only — the finding's `detail` is deliberately NOT offered as the
 * `reason`. That text is written for the owner (it names components and risks),
 * and out-of-scope is a **client-facing** section the R7 rules keep jargon-free.
 * An absent reason is explicitly allowed there ("some exclusions are
 * self-evident"), which beats importing engineering prose into a client's
 * document. The owner can still type one.
 */
export function draftOutOfScope(finding: ReviewFinding): string {
  return finding.title;
}

/** A first draft of the assumption a forwarded question implies. Owner-editable. */
export function draftAssumption(
  finding: ReviewFinding,
  question: string,
): RequirementAssumption {
  return {
    assumption: question,
    impactIfWrong: finding.detail || 'To be confirmed with the client.',
  };
}

// ── The fix log ─────────────────────────────────────────────────────────────

/** What the owner did about a finding. */
export type FixAction =
  | 'patch_applied'
  | 'added_open_question'
  | 'added_out_of_scope'
  | 'acknowledged'
  | 'dismissed';

/**
 * One append-only record of an approved action.
 *
 * It lives on the **session**, not the review, and that is load-bearing: a re-run
 * replaces the review row wholesale (statuses reset — a re-run is a fresh
 * assessment), and the review *is* carried in version snapshots, so a restore
 * would rewind a log stored there to an earlier state. An audit log that a restore
 * can rewind is not an audit log.
 *
 * Because it outlives the report it describes, it carries `findingTitle` — after a
 * re-run the id points at nothing, and "resolved finding security:0" is not a
 * record anyone can read.
 */
export interface FixLogEntry {
  findingId: string;
  /** Copied at write time so the entry still reads after a re-run. */
  findingTitle: string;
  action: FixAction;
  /** The stages whose artifacts were written. Empty for advisory actions. */
  artifactsTouched: PatchableStage[];
  /** ISO timestamp. */
  at: string;
  /** The owner's note (dismissals). */
  note?: string;
}

/** The status a fix action moves its finding to. */
export const FIX_ACTION_STATUS: Readonly<Record<FixAction, FindingStatus>> = {
  patch_applied: 'resolved',
  added_open_question: 'converted',
  added_out_of_scope: 'converted',
  acknowledged: 'resolved',
  dismissed: 'dismissed',
};

/** Append to the log. Pure — the log is append-only, so this never rewrites. */
export function appendFixLog(
  log: FixLogEntry[] | null | undefined,
  entry: FixLogEntry,
): FixLogEntry[] {
  return [...(log ?? []), entry];
}

/**
 * What an approved fix changed. One shape for all three flows (patch, conversion,
 * advisory) so the client has a single thing to react to: re-render the review,
 * show the log, and refetch exactly the artifacts in `artifactsTouched` — which is
 * also precisely the set whose staleness flags just moved.
 */
export interface FixResult {
  review: ReviewReport;
  fixLog: FixLogEntry[];
  /** Empty for an advisory acknowledge/dismiss — nothing was written. */
  artifactsTouched: PatchableStage[];
}

// The score delta a re-run shows ("60 → 78") is deliberately NOT computed here.
// It needs the score as it stood when the owner pressed Re-run, and only the view
// knows that — it captures it at click time. A helper taking a "previous report"
// would need a caller that keeps one, and nothing does.
