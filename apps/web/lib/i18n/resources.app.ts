import enDashboard from '@/locales/en/dashboard.json';
import enBilling from '@/locales/en/billing.json';
import enInterview from '@/locales/en/interview.json';
import enProject from '@/locales/en/project.json';
import enStages from '@/locales/en/stages.json';
import enSettings from '@/locales/en/settings.json';
import enAdmin from '@/locales/en/admin.json';
import enSupport from '@/locales/en/support.json';

/**
 * English bundles for the **authenticated app only** — namespaces no public
 * page (landing, legal, auth forms) ever reads. Split from `resources.ts` so
 * the marketing page doesn't parse the dashboard's, billing's, and admin
 * console's copy before it can become interactive.
 *
 * Like `resources.ar.ts`: only `client.ts` may import this, and only via a
 * dynamic `import()` (`loadAppNamespaces()`), or the chunk folds back into the
 * shared bundle. AuthGate awaits that loader alongside its `/auth/me` check, so
 * app pages never render with a namespace missing.
 */
export const appResources = {
  dashboard: enDashboard,
  billing: enBilling,
  interview: enInterview,
  project: enProject,
  stages: enStages,
  settings: enSettings,
  admin: enAdmin,
  support: enSupport,
} as const;
