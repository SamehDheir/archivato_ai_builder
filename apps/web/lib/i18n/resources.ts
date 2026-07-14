import enCommon from '@/locales/en/common.json';
import enAuth from '@/locales/en/auth.json';
import enMarketing from '@/locales/en/marketing.json';
import enLegal from '@/locales/en/legal.json';

/** Translation namespaces. Add new domains here as later phases land. */
export const namespaces = [
  'common',
  'auth',
  'marketing',
  'dashboard',
  'billing',
  'interview',
  'project',
  'stages',
  'settings',
  'admin',
  'support',
  'legal',
  'share',
] as const;
export const defaultNS = 'common';

/**
 * Statically bundled translations — **English, public surface only** (the
 * namespaces the landing, legal, and auth pages read). These must be available
 * synchronously for the first render since EN is the default/SSR locale.
 *
 * Everything else loads on demand as its own chunk:
 *   - `resources.app.ts`   — EN for the authenticated app (awaited by AuthGate);
 *   - `resources.share.ts` — EN for the public share page (`stages` + `share`);
 *   - `resources.ar.ts`    — all Arabic (awaited by `loadLocale` on switch).
 *
 * Bundling all of it eagerly shipped ~240 KB of JSON to every visitor before
 * the marketing page could become interactive.
 */
export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    marketing: enMarketing,
    legal: enLegal,
  },
} as const;
