import { Skeleton, SkeletonText } from '@/components/ui/skeleton';

/**
 * The loading state for a generated artifact panel (vision, roadmap, cost,
 * threat model, QA plan, …).
 *
 * Every one of those panels used to render the same two anonymous grey blobs —
 * `<Skeleton h-16/><Skeleton h-40/>` — copy-pasted five times. Two problems with
 * that: it was five copies of one decision, and it looked nothing like what
 * actually arrives, so the page visibly re-laid-out the moment it did.
 *
 * This mirrors the real shape every artifact view renders: a meta line, then
 * sections of heading + prose, then a table-ish block. The skeleton's job is to
 * reserve the space the content will occupy, so the arrival is a fill rather
 * than a jump — which is also why it isn't a spinner. A spinner says "wait"; a
 * skeleton says "here is what is coming, and here is how much of it".
 *
 * `aria-busy` + a polite live region: a screen-reader user gets "Loading…" once,
 * rather than either silence or a stream of empty divs.
 */
export function ArtifactSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-busy aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* The "generated <date>" meta row + download control. */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3.5 w-56" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* A prose section: icon + heading, then body copy. */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonText lines={3} />
      </div>

      {/* A table section: heading, then rows. Matches the artifact tables' real
          rhythm (a narrow id/label column beside a wide content column). */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-6 rounded-full" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-12 shrink-0" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The dashboard's project card, while the list loads.
 *
 * Deliberately card-shaped rather than a flat bar: the dashboard is a grid, and
 * a skeleton that doesn't reserve the card's real height makes the whole grid
 * reflow when the data lands.
 */
export function ProjectCardSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 shadow-xs"
      role="status"
      aria-busy
    >
      <span className="sr-only">Loading…</span>
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      {/* Client line, then the project title (two lines, second short). */}
      <Skeleton className="mb-2 h-3 w-28" />
      <Skeleton className="mb-1.5 h-4 w-full" />
      <Skeleton className="h-4 w-3/5" />
      {/* The pipeline rail. */}
      <div className="mt-5 space-y-1.5">
        <div className="flex justify-between">
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-8" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-1.5 flex-1 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
