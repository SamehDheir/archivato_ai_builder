'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, namespaces, defaultNS } from './resources';
import { defaultLocale } from './settings';

/**
 * The shared i18next instance. Initialized once (guards against Fast Refresh /
 * double-invoke). Translations are bundled statically in `resources`, so there's
 * no async load — `t()` is ready synchronously. The active language is set from
 * the persisted preference by `LocaleProvider` after mount; SSR renders in the
 * default locale.
 */
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    ns: namespaces as unknown as string[],
    defaultNS,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
