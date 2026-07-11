'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import i18n, { loadLocale } from '@/lib/i18n/client';
import {
  coerceLocale,
  defaultLocale,
  dirFor,
  LOCALE_COOKIE,
  LOCALE_LABEL,
  LOCALE_STORAGE,
  locales,
  type Locale,
} from '@/lib/i18n/settings';
import { cn } from '@/lib/utils';

interface LocaleCtx {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleCtx | null>(null);

export function useLocale(): LocaleCtx {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within <LocaleProvider>');
  return ctx;
}

/** Read the persisted locale (localStorage first, then cookie). */
function readStoredLocale(): Locale {
  if (typeof document === 'undefined') return defaultLocale;
  try {
    const ls = localStorage.getItem(LOCALE_STORAGE);
    if (ls) return coerceLocale(ls);
  } catch {
    /* storage blocked */
  }
  const m = document.cookie.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
  return coerceLocale(m?.[1]);
}

/**
 * Holds the active locale and keeps i18next + `<html lang/dir>` in sync. Sits
 * just under ThemeProvider in the layout. SSR renders the default locale; on
 * mount we apply the persisted choice (the pre-paint script has already set
 * `dir`/`lang` to avoid an RTL flash).
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  const apply = useCallback((next: Locale) => {
    setLocaleState(next);
    // `dir`/`lang` flip immediately (layout must not wait on a chunk); the
    // translation switch itself waits for the locale's bundle — Arabic is
    // lazy-loaded as its own chunk, and switching before it registers would
    // briefly leak English through `fallbackLng`.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
      document.documentElement.dir = dirFor(next);
    }
    void loadLocale(next).then(() => i18n.changeLanguage(next));
  }, []);

  useEffect(() => {
    apply(readStoredLocale());
  }, [apply]);

  const setLocale = useCallback(
    (next: Locale) => {
      try {
        localStorage.setItem(LOCALE_STORAGE, next);
      } catch {
        /* storage blocked */
      }
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      apply(next);
    },
    [apply],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  );
}

/**
 * Compact language switcher. With two locales it toggles between them, showing
 * the language it will switch TO (each in its own script).
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation('common');
  const next: Locale = locales.find((l) => l !== locale) ?? defaultLocale;

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      title={t('language.switchTo', { lang: LOCALE_LABEL[next] })}
      aria-label={t('language.switchTo', { lang: LOCALE_LABEL[next] })}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Languages className="h-4 w-4" />
      <span className="font-medium">{LOCALE_LABEL[next]}</span>
    </button>
  );
}
