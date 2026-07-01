import { cn } from '@/lib/utils';

/**
 * Archivato logo mark — the brand icon (matches `public/logo-icon.svg` and the
 * `app/icon.svg` favicon): a layout frame whose connected nodes form an "A" in
 * indigo, topped by a cyan apex. Inlined so it stays crisp and paints with no
 * extra request; colors are fixed so it reads on both light and dark surfaces.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Archivato"
    >
      <g fill="none" stroke="#6366F1" strokeWidth={2.5} strokeLinecap="round">
        <line x1={32} y1={13} x2={20} y2={35} />
        <line x1={32} y1={13} x2={44} y2={35} />
        <line x1={20} y1={35} x2={14} y2={50} />
        <line x1={44} y1={35} x2={50} y2={50} />
        <line x1={20} y1={35} x2={44} y2={35} />
      </g>
      <rect x={9} y={49} width={9} height={9} rx={2.5} fill="#6366F1" />
      <rect x={46} y={49} width={9} height={9} rx={2.5} fill="#6366F1" />
      <circle cx={20} cy={35} r={4} fill="#4338CA" />
      <circle cx={44} cy={35} r={4} fill="#4338CA" />
      <circle cx={32} cy={13} r={5} fill="#22D3EE" />
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
