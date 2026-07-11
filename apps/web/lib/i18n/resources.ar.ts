import arCommon from '@/locales/ar/common.json';
import arAuth from '@/locales/ar/auth.json';
import arMarketing from '@/locales/ar/marketing.json';
import arDashboard from '@/locales/ar/dashboard.json';
import arBilling from '@/locales/ar/billing.json';
import arInterview from '@/locales/ar/interview.json';
import arProject from '@/locales/ar/project.json';
import arStages from '@/locales/ar/stages.json';
import arSettings from '@/locales/ar/settings.json';
import arAdmin from '@/locales/ar/admin.json';
import arSupport from '@/locales/ar/support.json';
import arLegal from '@/locales/ar/legal.json';

/**
 * The Arabic bundle, in its own module so it becomes its own chunk.
 *
 * Only `client.ts` may import this file, and only via a **dynamic** `import()`
 * (`loadArabic()`): a static import anywhere would fold ~120 KB of JSON back
 * into the shared bundle that every visitor — overwhelmingly English-locale on
 * first touch — has to download and parse before the page is interactive.
 */
export const arResources = {
  common: arCommon,
  auth: arAuth,
  marketing: arMarketing,
  dashboard: arDashboard,
  billing: arBilling,
  interview: arInterview,
  project: arProject,
  stages: arStages,
  settings: arSettings,
  admin: arAdmin,
  support: arSupport,
  legal: arLegal,
} as const;
