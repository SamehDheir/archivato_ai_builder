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
  /**
   * A USD amount. Sums under $1 keep sub-cent precision — a single LLM call
   * costs fractions of a cent, and rounding those to `$0.00` would make the
   * whole spend view read as free.
   */
  usd: (value: number) => string;
  /** ISO-3166-1 alpha-2 country code → localized name (falls back to the code). */
  country: (code: string) => string;
  /**
   * Compact relative time ("2 hours ago"), coarsening from seconds to years.
   *
   * Lives here rather than beside its caller because it is the same locale
   * question `date` answers — including the Arabic Latin-numeral rule above,
   * which a private copy would have to remember and eventually wouldn't.
   */
  relative: (value: string | number | Date) => string;
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
    const money = new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: 'USD',
    });
    const smallMoney = new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 4,
    });
    // Keep region names in the active locale's script (not forced to Latin).
    const regions = new Intl.DisplayNames(locale === 'ar' ? 'ar' : 'en', {
      type: 'region',
    });
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
    return {
      date: (v) => d.format(new Date(v)),
      dateTime: (v) => dt.format(new Date(v)),
      number: (v) => n.format(v),
      usd: (v) => (Math.abs(v) >= 1 || v === 0 ? money : smallMoney).format(v),
      country: (code) => {
        try {
          return regions.of(code.toUpperCase()) ?? code;
        } catch {
          return code;
        }
      },
      relative: (v) => {
        const sec = Math.round((Date.now() - new Date(v).getTime()) / 1000);
        const min = Math.round(sec / 60);
        const hr = Math.round(min / 60);
        const day = Math.round(hr / 24);
        const mon = Math.round(day / 30);
        if (Math.abs(sec) < 60) return rtf.format(-sec, 'second');
        if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
        if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
        if (Math.abs(day) < 30) return rtf.format(-day, 'day');
        if (Math.abs(mon) < 12) return rtf.format(-mon, 'month');
        return rtf.format(-Math.round(mon / 12), 'year');
      },
    };
  }, [locale]);
}
