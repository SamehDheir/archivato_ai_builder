'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, type LucideIcon } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  /** Muted text on the right (e.g. a status or category). */
  hint?: string;
  /** Extra text matched by the filter but not shown. */
  keywords?: string;
  icon?: LucideIcon;
  run: () => void;
}

export interface CommandGroup {
  heading: string;
  items: Command[];
}

/**
 * A ⌘K command palette for jumping between projects and stages (and quick
 * actions). Purely presentational + keyboard-driven — the caller supplies the
 * grouped commands and controls `open`. Filtering is a simple case-insensitive
 * substring over label + keywords + group heading.
 */
export function CommandPalette({
  open,
  onClose,
  groups,
  placeholder,
}: {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
}) {
  const { t } = useTranslation('dashboard');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset each time the palette opens, and focus the input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo<CommandGroup[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups.filter((g) => g.items.length > 0);
    return groups
      .map((g) => ({
        heading: g.heading,
        items: g.items.filter((c) =>
          `${c.label} ${c.keywords ?? ''} ${g.heading}`
            .toLowerCase()
            .includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  // Flat list of commands, in render order, for keyboard navigation.
  const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);

  // Keep the active index in range as the filter narrows.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  if (!open) return null;

  const runActive = () => {
    const cmd = flat[active];
    if (cmd) {
      onClose();
      cmd.run();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={placeholder ?? t('palette.placeholder')}
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('palette.noMatches')}
            </p>
          ) : (
            filtered.map((g) => (
              <div key={g.heading} className="mb-1 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {g.heading}
                </p>
                {g.items.map((c) => {
                  const idx = flat.indexOf(c);
                  const isActive = idx === active;
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        onClose();
                        c.run();
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        isActive ? 'bg-muted' : 'hover:bg-muted/60'
                      }`}
                    >
                      {Icon && (
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{c.label}</span>
                      {c.hint && (
                        <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                          {c.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>↑↓ {t('palette.navigate')}</span>
          <span>↵ {t('palette.open')}</span>
          <span>esc {t('palette.close')}</span>
        </div>
      </div>
    </div>
  );
}
