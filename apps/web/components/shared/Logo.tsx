import { cn } from '@/lib/utils';

/**
 * Archivato logo mark — the brand icon (matches `public/logo-icon.svg` and, on
 * an indigo tile, the `app/icon.svg` favicon): an architecture truss whose
 * connected nodes form an "A", topped by a cyan apex. Inlined so it stays crisp
 * and paints with no extra request; colors are fixed so it reads on both light
 * and dark surfaces.
 *
 * Geometry is deliberately coarse (few, thick strokes; no sub-4px details) so
 * the same shape survives the 16px browser tab — the favicon is this mark, and
 * anything finer turns to mush at that size.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Archivato"
    >
      <g
        fill="none"
        stroke="#6366F1"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 50 32 15 47 50" />
        <path d="M23.3 36h17.4" />
      </g>
      <circle cx={17} cy={50} r={4.2} fill="#4338CA" />
      <circle cx={47} cy={50} r={4.2} fill="#4338CA" />
      <circle cx={32} cy={15} r={5.6} fill="#22D3EE" />
    </svg>
  );
}

/** The lockup: mark + "Archivato" wordmark (wordmark inherits the text color). */
export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold', className)}>
      <LogoMark className={cn('h-7 w-7', markClassName)} />
      <span>Archivato</span>
    </span>
  );
}
