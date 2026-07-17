import { cn } from '@/lib/utils';

/**
 * A loading placeholder.
 *
 * Uses a shimmer rather than `animate-pulse`: a pulsing block reads as "this
 * element is broken/disabled", a left-to-right shimmer reads as "this is
 * arriving". `motion-reduce:animate-none` leaves a plain block for anyone who
 * asked the OS for less motion — the shape is what carries the meaning, the
 * animation is only the liveness cue.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-md bg-muted motion-reduce:animate-none',
        'bg-[linear-gradient(90deg,hsl(var(--muted))_0%,hsl(var(--accent))_50%,hsl(var(--muted))_100%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A run of text lines. The last line is short, because real paragraphs end
 * mid-measure — an even stack of full-width bars reads as a UI element, not as
 * prose about to land.
 */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 ? 'w-2/5' : 'w-full')}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
