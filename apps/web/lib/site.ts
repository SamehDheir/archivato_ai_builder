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
export const siteTagline = 'Client scoping in an hour, not a week.';

export const siteDescription =
  'Client scoping for software shops: turn a client call into a complete ' +
  'scoping package — requirements, system architecture, cost estimate, and a ' +
  'client-ready proposal — in one hour instead of one week. Win the deal before ' +
  'your competitor finishes their first meeting.';

/** The pipeline, as shown on the OG card. Mirrors the landing page's promise. */
export const sitePipeline = [
  'Client call',
  'Requirements',
  'Architecture',
  'Cost estimate',
  'Proposal',
] as const;

/**
 * Brand colours, shared by the logo, the favicon tile, the OG card and the web
 * manifest.
 *
 * These MIRROR the `--primary` / `--background` tokens in app/globals.css and
 * must be kept in step with them — they are literals only because every consumer
 * renders where no stylesheet exists: Satori (the OG card) has no CSS engine, a
 * favicon is a standalone file, and `theme_color` is read by OS browser chrome
 * before any CSS loads. There is nothing to resolve a `var()` against.
 *
 * The keys are deliberately hue-free. They used to be `indigo` / `indigoDeep` /
 * `cyan`, and when R14 moved the accent to teal every one of those names became
 * a lie while still compiling — the fastest way to a codebase where the constant
 * says indigo and the pixel is teal. Name the ROLE, not the colour.
 */
export const brand = {
  /** The mark's strokes. Mid-weight on purpose: legible on white AND on ink. */
  accent: '#1598AC',
  /** Nodes + the favicon tile's gradient end. */
  accentDeep: '#0A4E5C',
  /** The apex + on-dark accents. Mirrors `--primary` in the dark theme. */
  accentBright: '#2CCBDD',
  /** The dark canvas. Mirrors `--background` in the dark theme. */
  ink: '#0D1317',
} as const;

/**
 * The public demo package's route.
 *
 * It lives here rather than in `lib/demo-scoping-package.ts` (its natural home)
 * because the landing page needs the path and nothing else: that module builds
 * the whole fixture, so importing the constant from it risks pulling the entire
 * example project into the landing bundle. `site.ts` has no dependencies, so
 * every consumer can share one literal without paying for the payload.
 */
export const DEMO_PATH = '/demo-scoping-package';

/**
 * Public routes worth putting in the sitemap (everything else is auth-gated).
 *
 * `/demo-scoping-package` is here on purpose and `/s/<token>` never will be:
 * the demo is a fictional package we wrote to be published, while a real share
 * link is someone's business idea, sent to specific people (robots.ts disallows
 * `/s/` and the page carries `noindex`). The difference is consent, not content.
 */
export const publicRoutes = [
  '/',
  DEMO_PATH,
  '/login',
  '/register',
  '/privacy',
  '/terms',
] as const;
