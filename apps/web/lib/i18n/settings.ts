/**
 * i18n settings — locale list, direction, and the storage keys used to persist
 * the user's choice. Toggle-based (no locale routing): the preference lives in
 * localStorage + a cookie so the pre-paint script and the provider agree.
 */

export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Human labels for the switcher (each shown in its own script). */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  ar: 'Arabic',
};

/**
 * Right-to-left locales — the single source of truth for direction.
 *
 * Adding an RTL locale (he, fa, ur, …) means adding it to `locales` and to this
 * list, and nothing else: `dirFor` is what `<html dir>`, the pre-paint script in
 * the root layout, and Radix's `DirectionProvider` all consult. Nothing in the
 * layout compares against `'ar'` directly, so the mirroring is a property of the
 * language's writing direction rather than of one specific language.
 *
 * Exported because the root layout's pre-paint script has to be BUILT from it —
 * that script is an inline string running before React, so it cannot call
 * `dirFor`, and a hand-copied `'ar'` in there would be the one place a new RTL
 * locale silently failed to flip.
 */
export const rtlLocales: readonly Locale[] = ['ar'];
export const isRtl = (locale: string): boolean =>
  rtlLocales.includes(locale as Locale);
export const dirFor = (locale: string): 'rtl' | 'ltr' =>
  isRtl(locale) ? 'rtl' : 'ltr';

/** Persisted preference keys (mirrors the theme's localStorage + cookie idea). */
export const LOCALE_STORAGE = 'archivato.locale';
export const LOCALE_COOKIE = 'archivato_locale';

/** Narrow any string to a supported Locale, else the default. */
export function coerceLocale(value: string | null | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}
