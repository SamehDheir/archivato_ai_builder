import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * Crawl rules. The authenticated app is disallowed — those routes render nothing
 * useful to a crawler (AuthGate shows a sign-in form) and would otherwise dilute
 * the marketing page with dead, thin results.
 *
 * `/s/` (public share links) is disallowed for a different reason: those pages
 * render fine, but they are **unlisted, not published** — someone's business idea,
 * sent to specific people. Indexing them would publish it. The pages carry a
 * `noindex` too (robots.txt alone only stops the crawl, not an index entry
 * discovered elsewhere).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/settings', '/admin', '/support', '/verify', '/s/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
