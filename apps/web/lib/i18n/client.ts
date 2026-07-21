'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, namespaces, defaultNS } from './resources';
import { defaultLocale, type Locale } from './settings';

/**
 * The shared i18next instance. Initialized once (guards against Fast Refresh /
 * double-invoke). English is bundled statically in `resources`, so `t()` is
 * ready synchronously for the default/SSR locale. **Arabic is not bundled**: it
 * is fetched as its own chunk by `loadLocale('ar')` the first time it's needed
 * (see `resources.ar.ts` for why). The active language is set from the persisted
 * preference by `LocaleProvider` after mount; SSR renders in the default locale.
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

/**
 * Ensure a locale's bundles are registered before switching to it.
 *
 * English is a no-op (its public-surface namespaces are statically bundled).
 * Arabic dynamic-imports its bundle on first use — webpack splits it into a
 * separate chunk — and registers every namespace. Failure (offline, chunk 404
 * after a redeploy) resolves rather than throws: the UI then falls back to
 * English via `fallbackLng`, which beats a crash in a language switcher.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (locale !== 'ar' || i18n.hasResourceBundle('ar', defaultNS)) return;
  try {
    const { arResources } = await import('./resources.ar');
    for (const [ns, bundle] of Object.entries(arResources)) {
      i18n.addResourceBundle('ar', ns, bundle, true, true);
    }
  } catch {
    /* fall back to English */
  }
}

/**
 * Register the authenticated app's English namespaces (dashboard, billing,
 * project, admin, support, …), which are split out of the eager bundle so the
 * public pages don't pay for them. AuthGate awaits this in parallel with its
 * `/auth/me` check and holds its loading screen until both settle, so an app
 * page can never render with a namespace missing. Same failure posture as
 * `loadLocale`: resolve and let `t()` fall back to keys rather than crash.
 */
export async function loadAppNamespaces(): Promise<void> {
  if (i18n.hasResourceBundle('en', 'dashboard')) return;
  try {
    const { appResources } = await import('./resources.app');
    for (const [ns, bundle] of Object.entries(appResources)) {
      i18n.addResourceBundle('en', ns, bundle, true, true);
    }
  } catch {
    /* t() falls back to keys */
  }
}

/**
 * Register the English namespaces the **public share page** needs (the artifact
 * views' `stages` chrome + the page's own `share` copy). Its own tier rather than
 * `loadAppNamespaces()`: a share link is a cold entry point for someone who has
 * never seen the product, and it has no business downloading the admin console's
 * copy to render a design. `SharedProjectView` awaits this before its first
 * render, so the page never flashes raw keys.
 */
export async function loadShareNamespaces(): Promise<void> {
  if (i18n.hasResourceBundle('en', 'share')) return;
  try {
    const { shareResources } = await import('./resources.share');
    for (const [ns, bundle] of Object.entries(shareResources)) {
      i18n.addResourceBundle('en', ns, bundle, true, true);
    }
  } catch {
    /* t() falls back to keys */
  }
}

/**
 * Put the share page into the language its **document** is written in.
 *
 * The public page is the one surface where the viewer's preference is the wrong
 * signal. Everywhere else the chrome follows a locale the user chose; here the
 * reader is the *client*, arriving cold from a link with no stored preference,
 * so they get the default — English — while the artifacts may be Arabic. That
 * produces the exact failure this whole change exists to remove: translated
 * headers wrapped around prose in another language, on the page a vendor sends
 * to win the work.
 *
 * So the document decides. `loadLocale` first, because `changeLanguage` on a
 * locale whose bundle has not been registered renders raw keys for a frame; the
 * chrome namespaces are loaded alongside it for the same reason.
 *
 * Failure resolves rather than throws (the `loadLocale` posture): a client who
 * cannot fetch the Arabic chunk should read an English-chrome page, not a
 * broken one.
 */
export async function applyShareDocumentLanguage(locale: Locale): Promise<void> {
  await Promise.all([loadShareNamespaces(), loadLocale(locale)]);
  if (i18n.language !== locale) {
    try {
      await i18n.changeLanguage(locale);
    } catch {
      /* keep the current language rather than fail the page */
    }
  }
}

export default i18n;
