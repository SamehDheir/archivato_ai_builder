import {
  isStale,
  upstreamStamp,
  type UpstreamRevisions,
} from '@archivato/shared';

/** The design a derived artifact was generated from. */
const v1: UpstreamRevisions = {
  requirements: '2026-01-01T00:00:00.000Z',
  systemDesign: '2026-01-01T00:01:00.000Z',
  databaseDesign: '2026-01-01T00:02:00.000Z',
  apiDesign: '2026-01-01T00:03:00.000Z',
};

/** After a chat refine: every design artifact is regenerated. */
const v2: UpstreamRevisions = {
  requirements: '2026-02-01T00:00:00.000Z',
  systemDesign: '2026-02-01T00:01:00.000Z',
  databaseDesign: '2026-02-01T00:02:00.000Z',
  apiDesign: '2026-02-01T00:03:00.000Z',
};

const roadmapOn = (r: UpstreamRevisions) => ({
  sourceStamp: upstreamStamp('roadmap', r),
});

describe('derived-artifact freshness', () => {
  it('is stable for the same design and changes when any source does', () => {
    expect(upstreamStamp('roadmap', v1)).toBe(upstreamStamp('roadmap', v1));
    expect(upstreamStamp('roadmap', v2)).not.toBe(upstreamStamp('roadmap', v1));
  });

  it('flags an artifact left behind by a refine', () => {
    const roadmap = roadmapOn(v1);
    expect(isStale('roadmap', roadmap, v1)).toBe(false);
    expect(isStale('roadmap', roadmap, v2)).toBe(true);
  });

  it('flags an artifact whose design was RESTORED to an older revision', () => {
    // The case a "is any source newer than me?" check silently misses: the
    // roadmap was built from v2, then a version restore rewound the design to v1.
    // Nothing upstream is newer, yet the roadmap describes a design that is gone.
    const roadmap = roadmapOn(v2);
    expect(isStale('roadmap', roadmap, v1)).toBe(true);
  });

  it('flags an artifact after a single upstream artifact is edited', () => {
    // The structured editors autosave, and `save()` stamps a fresh generatedAt.
    const roadmap = roadmapOn(v1);
    const edited = { ...v1, databaseDesign: '2026-03-01T00:00:00.000Z' };
    expect(isStale('roadmap', roadmap, edited)).toBe(true);
  });

  it('does not nag about the requirements when the stage never reads them', () => {
    // The cost estimate derives a workload from the DESIGNS. Editing a
    // requirement without regenerating them leaves its numbers exactly as valid.
    const estimate = { sourceStamp: upstreamStamp('cost-estimate', v1) };
    const editedReqs = { ...v1, requirements: '2026-03-01T00:00:00.000Z' };

    expect(isStale('cost-estimate', estimate, editedReqs)).toBe(false);
    // …while a stage that does read them is correctly flagged by the same change.
    expect(isStale('roadmap', roadmapOn(v1), editedReqs)).toBe(true);
  });

  it('treats an unstamped or missing artifact as fresh', () => {
    // Rows generated before stamping existed carry no stamp. We cannot know what
    // they were built from, and nagging every pre-existing project to re-run a
    // billed Pro stage on a guess would be worse than the bug this fixes.
    expect(isStale('roadmap', { sourceStamp: undefined }, v2)).toBe(false);
    expect(isStale('roadmap', null, v2)).toBe(false);
  });
});
