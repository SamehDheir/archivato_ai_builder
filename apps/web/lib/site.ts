/**
 * Canonical, server-side site identity — the single source of truth for every
 * place that has to state what this product *is* to a machine: the document
 * metadata, the OG/Twitter card, the web manifest, robots, and the sitemap.
 *
 * This copy is deliberately NOT i18n'd. It is consumed by crawlers and link
 * unfurlers at request time, before any locale is known (the locale lives in a
 * client-side cookie/localStorage), so it follows the same convention as the
 * rest of the project's machine-facing output: English, server-side.
 */

/**
 * Public origin used to resolve absolute URLs for OpenGraph/Twitter/sitemap.
 * Override in prod via NEXT_PUBLIC_SITE_URL; falls back to local dev.
 */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const siteName = 'Archivato AI Builder';

/** The one-line positioning statement. Doubles as the OG card's headline. */
export const siteTagline = 'Describe your idea. Ship a complete system design.';

export const siteDescription =
  'Turn a business idea into a complete software system design — interview, ' +
  'requirements, architecture, database, API, a scored AI review, and a build ' +
  'roadmap. Not a chatbot; an AI software architecture generator.';

/** The pipeline, as shown on the OG card. Mirrors the landing page strip. */
export const sitePipeline = [
  'Interview',
  'Requirements',
  'Architecture',
  'Database',
  'API',
  'Review',
  'Export',
] as const;

/** Brand colors shared by the OG card and the web manifest. */
export const brand = {
  indigo: '#6366F1',
  indigoDeep: '#4338CA',
  cyan: '#22D3EE',
  ink: '#0D0F16',
} as const;

/** Public routes worth putting in the sitemap (everything else is auth-gated). */
export const publicRoutes = ['/', '/login', '/register', '/privacy', '/terms'] as const;
