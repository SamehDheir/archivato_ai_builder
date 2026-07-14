'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Syncs the document title and meta description to the visitor's chosen locale.
 *
 * **This is for readers, not for crawlers — and the distinction matters.** The
 * locale lives in a client cookie, and a crawler sends no cookie, so the HTML
 * Google and the link unfurlers receive is always the English metadata from
 * `layout.tsx` (see `lib/site.ts` on why that copy is deliberately English and
 * server-side). Reading the cookie in `generateMetadata` instead would opt the
 * landing page out of static rendering — the one page whose load time we most
 * care about — and *still* serve English to every crawler, because the crawler
 * has no cookie to read. It would be a real cost for no SEO gain.
 *
 * So this does the honest, cheap thing: an Arabic visitor gets an Arabic tab
 * title and bookmark. Ranking for the Arabic keyword needs a real `/ar` route,
 * which is a routing change well beyond the landing page.
 */
export function LocalizedMeta() {
  const { t, i18n } = useTranslation('marketing');

  useEffect(() => {
    const title = t('meta.title');
    const description = t('meta.description');
    if (!title || title === 'meta.title') return; // bundle not loaded yet

    document.title = title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', description);
  }, [t, i18n.language]);

  return null;
}
