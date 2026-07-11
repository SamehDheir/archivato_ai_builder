import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * Crawl rules. The authenticated app is disallowed — those routes render nothing
 * useful to a crawler (AuthGate shows a sign-in form) and would otherwise dilute
 * the marketing page with dead, thin results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/settings', '/admin', '/support', '/verify'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
