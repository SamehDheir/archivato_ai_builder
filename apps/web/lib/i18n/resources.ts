import enCommon from '@/locales/en/common.json';
import enAuth from '@/locales/en/auth.json';
import enMarketing from '@/locales/en/marketing.json';
import enDashboard from '@/locales/en/dashboard.json';
import enBilling from '@/locales/en/billing.json';
import enInterview from '@/locales/en/interview.json';
import enProject from '@/locales/en/project.json';
import enStages from '@/locales/en/stages.json';
import enSettings from '@/locales/en/settings.json';
import enAdmin from '@/locales/en/admin.json';
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
] as const;
export const defaultNS = 'common';

/** All bundled translations, keyed by locale then namespace. */
export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    marketing: enMarketing,
    dashboard: enDashboard,
    billing: enBilling,
    interview: enInterview,
    project: enProject,
    stages: enStages,
    settings: enSettings,
    admin: enAdmin,
  },
  ar: {
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
  },
} as const;
