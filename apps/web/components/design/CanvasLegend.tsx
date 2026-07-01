'use client';

import { CATEGORY_LEGEND } from '@/lib/node-category';
import { cn } from '@/lib/utils';

/** A compact colour legend for the canvas node categories. */
export function CanvasLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <span className="font-medium">Legend:</span>
      {CATEGORY_LEGEND.map((c) => (
        <span key={c.label} className="flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: c.hex }}
            aria-hidden
          />
          {c.label}
        </span>
      ))}
    </div>
  );
}
