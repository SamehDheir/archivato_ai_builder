'use client';

import { useMemo } from 'react';
import { useLocale } from '@/components/shared/i18n';
import type { Locale } from '@/lib/i18n/settings';

/**
 * BCP-47 tags for `Intl`. We force Latin numerals (`nu-latn`) in Arabic so
 * dates, counts, and money in a technical dashboard stay legible — Arabic-Indic
 * digits alongside code/IDs read as noise. Text still renders in Arabic + RTL.
 */
const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  ar: 'ar-EG-u-nu-latn',
};

export interface Formatters {
  /** Date only, medium (e.g. "Jul 3, 2026"). */
  date: (value: string | number | Date) => string;
  /** Date + time, medium. */
  dateTime: (value: string | number | Date) => string;
  /** Plain integer/decimal with locale grouping. */
  number: (value: number) => string;
  /** ISO-3166-1 alpha-2 country code → localized name (falls back to the code). */
  country: (code: string) => string;
}

/** Locale-aware `Intl` formatters bound to the active UI locale. */
export function useFormat(): Formatters {
  const { locale } = useLocale();
  return useMemo(() => {
    const tag = INTL_LOCALE[locale] ?? INTL_LOCALE.en;
    const d = new Intl.DateTimeFormat(tag, { dateStyle: 'medium' });
    const dt = new Intl.DateTimeFormat(tag, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const n = new Intl.NumberFormat(tag);
    // Keep region names in the active locale's script (not forced to Latin).
    const regions = new Intl.DisplayNames(locale === 'ar' ? 'ar' : 'en', {
      type: 'region',
    });
    return {
      date: (v) => d.format(new Date(v)),
      dateTime: (v) => dt.format(new Date(v)),
      number: (v) => n.format(v),
      country: (code) => {
        try {
          return regions.of(code.toUpperCase()) ?? code;
        } catch {
          return code;
        }
      },
    };
  }, [locale]);
}
