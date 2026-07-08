'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useLocale } from '@/components/shared/i18n';
import { LOCALE_LABEL, locales, type Locale } from '@/lib/i18n/settings';
import { cn } from '@/lib/utils';

/**
 * Language switcher as a dropdown. The trigger shows only the current locale's
 * flag (no text label); the menu lists every locale with its flag + name and a
 * check on the active one. Uses inline SVG flags (not emoji — flag emoji don't
 * render on Windows browsers). Same dropdown mechanics as `NotificationBell` /
 * `AccountMenu` (outside-click + Escape to close, `end-0` for RTL).
 */
export function LanguageMenu({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('language.toggle')}
        title={t('language.toggle')}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Flag locale={locale} className="h-3 w-[18px] rounded-[3px] ring-1 ring-black/10" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === locale}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <Flag locale={l} className="h-3.5 w-5 rounded-[3px] ring-1 ring-black/10" />
              <span className="flex-1 text-start" dir="auto">
                {LOCALE_LABEL[l]}
              </span>
              {l === locale && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small inline SVG flag for a locale (rendered inside a fixed rounded box). */
function Flag({ locale, className }: { locale: Locale; className?: string }) {
  const id = useId();
  return (
    <span className={cn('inline-block overflow-hidden bg-muted', className)}>
      {locale === 'ar' ? <SaudiFlag /> : <UnionJack id={id} />}
    </span>
  );
}

/**
 * Flag of Saudi Arabia, kept minimal so it stays crisp at ~12–14px: a green
 * field with a single clean, centered white sword (pointed blade to the hoist,
 * a small crossguard + rounded pommel to the fly). The shahada script is
 * illegible at this size, so it's omitted rather than drawn as noise.
 */
function SaudiFlag() {
  return (
    <svg
      viewBox="0 0 60 40"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="60" height="40" fill="#006C35" />
      <g fill="#fff">
        {/* Blade: pointed tip on the left, level bar to the right. */}
        <path d="M8 20 L17 18.3 H44 V21.7 H17 Z" />
        {/* Crossguard. */}
        <rect x="43" y="16.8" width="2.6" height="6.4" rx="1.3" />
        {/* Grip + rounded pommel. */}
        <rect x="45.6" y="18.4" width="6.4" height="3.2" rx="1.6" />
        <circle cx="53.4" cy="20" r="2.1" />
      </g>
    </svg>
  );
}

/** Union Flag (canonical compact construction). `id` scopes its clip path. */
function UnionJack({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 60 30"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <clipPath id={id}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath={`url(#${id})`}
        stroke="#C8102E"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
