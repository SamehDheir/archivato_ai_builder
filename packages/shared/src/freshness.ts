/**
 * **Derived-artifact freshness.** Pure and runtime-free (no crypto, no I/O), so
 * the API stamps with it and the web reads it with the same code.
 *
 * The problem it solves: chat refine regenerates requirements → system → database
 * → API (and the review), but the *standalone* stages — roadmap, cost estimate,
 * threat model, QA plan — hang off the design without gating it, so nothing
 * regenerated them. The user was left looking at a roadmap for a design that no
 * longer exists, with no indication anything was wrong. The same happens when an
 * artifact is edited (the structured editors autosave) or a version is restored.
 *
 * How it works: at generation time an artifact records the exact upstream
 * revisions it was built from (`sourceStamp`). Later, we rebuild that stamp from
 * the current upstream and compare.
 *
 * Two decisions worth keeping:
 *
 * 1. **Equality, not recency.** The obvious rule — "stale if an upstream artifact
 *    is *newer* than me" — misses a version restore, which rewinds the design to
 *    an *older* revision underneath a newer roadmap. That roadmap describes a
 *    design that no longer exists, and a `>` comparison calls it fresh. Comparing
 *    the recorded revision for equality catches it.
 *
 * 2. **An unstamped artifact is never stale.** Rows generated before this existed
 *    carry no stamp, and we cannot know what they were built from. "Unknown" must
 *    read as fresh: nagging every pre-existing project to regenerate — on a Pro,
 *    LLM-billed stage — on nothing but a guess would be worse than the bug.
 *
 * `generatedAt` is the revision marker because every write path moves it: an
 * agent run sets it, and `save()` (the editors) stamps a fresh one on every edit.
 */

/** A stage generated *from* the design chain, rather than part of it. */
export type DerivedStage =
  | 'review'
  | 'roadmap'
  | 'cost-estimate'
  | 'threat-model'
  | 'qa-plan';

/** The upstream artifacts a derived stage can be built from. */
export type UpstreamKey =
  | 'requirements'
  | 'systemDesign'
  | 'databaseDesign'
  | 'apiDesign';

/**
 * What each derived stage's freshness tracks — mirrors the design inputs each
 * `generate()` derives its OUTPUT from, and the difference matters: the **cost
 * estimate's figures derive only from the designs**, so a requirement edit must
 * not nag the user to re-run it. (R9's cost service does read the requirement
 * doc, but only for the budget warning's out-of-scope *hint* — a boolean not
 * worth flagging a whole deterministic estimate stale over — so `requirements`
 * is intentionally omitted here.)
 */
export const DERIVED_STAGE_SOURCES: Readonly<Record<DerivedStage, readonly UpstreamKey[]>> =
  {
    review: ['requirements', 'systemDesign', 'databaseDesign', 'apiDesign'],
    roadmap: ['requirements', 'systemDesign', 'databaseDesign', 'apiDesign'],
    'cost-estimate': ['systemDesign', 'databaseDesign', 'apiDesign'],
    'threat-model': ['requirements', 'systemDesign', 'databaseDesign', 'apiDesign'],
    'qa-plan': ['requirements', 'systemDesign', 'databaseDesign', 'apiDesign'],
  };

/** Just the revision of each upstream artifact — its `generatedAt`, if it exists. */
export type UpstreamRevisions = Partial<Record<UpstreamKey, string | null | undefined>>;

/** An artifact that records the upstream revisions it was generated from. */
export interface DerivedArtifact {
  /** Absent on rows generated before stamping existed — see the file header. */
  sourceStamp?: string;
}

/**
 * The stamp for a stage, from the given upstream revisions. Deterministic: the
 * keys are read in the fixed order declared above, so the same design always
 * produces the same stamp.
 */
export function upstreamStamp(
  stage: DerivedStage,
  revisions: UpstreamRevisions,
): string {
  return DERIVED_STAGE_SOURCES[stage]
    .map((key) => `${key}:${revisions[key] ?? ''}`)
    .join('|');
}

/**
 * Whether a derived artifact was built from a design that has since changed.
 *
 * An artifact with no stamp reads as fresh (see the file header), as does a
 * missing artifact — there is nothing to be stale.
 */
export function isStale(
  stage: DerivedStage,
  artifact: DerivedArtifact | null | undefined,
  revisions: UpstreamRevisions,
): boolean {
  if (!artifact?.sourceStamp) return false;
  return artifact.sourceStamp !== upstreamStamp(stage, revisions);
}
