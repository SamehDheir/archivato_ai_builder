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

/** Right-to-left locales. */
const RTL_LOCALES: Locale[] = ['ar'];
export const isRtl = (locale: string): boolean =>
  RTL_LOCALES.includes(locale as Locale);
export const dirFor = (locale: string): 'rtl' | 'ltr' =>
  isRtl(locale) ? 'rtl' : 'ltr';

/** Persisted preference keys (mirrors the theme's localStorage + cookie idea). */
export const LOCALE_STORAGE = 'archivato.locale';
export const LOCALE_COOKIE = 'archivato_locale';

/** Narrow any string to a supported Locale, else the default. */
export function coerceLocale(value: string | null | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}
