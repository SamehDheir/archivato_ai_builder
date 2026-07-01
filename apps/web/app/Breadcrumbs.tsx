'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  /** Full text for the title tooltip (labels are truncated). */
  title?: string;
  /** Makes the crumb a clickable link (ignored for the last/current crumb). */
  onClick?: () => void;
}

/** A "Projects / Project / Stage" trail so users always know where they are. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {c.onClick && !last ? (
                <button
                  type="button"
                  onClick={c.onClick}
                  title={c.title ?? c.label}
                  className="max-w-[12rem] truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  {c.label}
                </button>
              ) : (
                <span
                  title={c.title ?? c.label}
                  aria-current={last ? 'page' : undefined}
                  className={cn(
                    'max-w-[14rem] truncate',
                    last
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {c.label}
                </span>
              )}
              {!last && (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
