import { brand } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * Archivato logo mark — the brand icon (matches `public/logo-icon.svg` and, on a
 * teal tile, the `app/icon.svg` favicon): an architecture truss whose connected
 * nodes form an "A", topped by a bright apex. Inlined so it stays crisp and
 * paints with no extra request.
 *
 * The colours come from `brand` (lib/site.ts) rather than being typed in here,
 * so the mark, the favicon, the touch icon and the OG card cannot drift apart —
 * they did exactly that before R14, when the mark stayed indigo after the accent
 * moved to teal. They are fixed values (not tokens) because this same mark is
 * rendered into the OG card by Satori, where no stylesheet exists; and they are
 * mid-weight so the mark reads on a white page AND on the dark app shell.
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
        stroke={brand.accent}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 50 32 15 47 50" />
        <path d="M23.3 36h17.4" />
      </g>
      <circle cx={17} cy={50} r={4.2} fill={brand.accentDeep} />
      <circle cx={47} cy={50} r={4.2} fill={brand.accentDeep} />
      <circle cx={32} cy={15} r={5.6} fill={brand.accentBright} />
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
