import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthGate } from '@/components/auth/AuthGate';
import { ToastProvider } from '@/components/shared/toast';
import { ThemeProvider } from '@/components/shared/theme';
import { ConfirmProvider } from '@/components/shared/confirm-dialog';
import { UpgradeProvider } from '@/components/billing/upgrade-dialog';
import { LocaleProvider } from '@/components/shared/i18n';
import { PageviewTracker } from '@/components/shared/pageview-tracker';
import { CookieConsent } from '@/components/shared/cookie-consent';
import {
  siteDescription as description,
  siteName as title,
  siteTagline,
  siteUrl,
} from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${title} — ${siteTagline}`,
    template: '%s · Archivato AI Builder',
  },
  description,
  applicationName: title,
  keywords: [
    'AI architecture generator',
    'system design',
    'software architecture',
    'requirements generator',
    'database design',
    'API design',
    'AI SaaS',
  ],
  authors: [{ name: 'Archivato' }],
  creator: 'Archivato',
  publisher: 'Archivato',
  category: 'technology',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: title,
    locale: 'en_US',
    alternateLocale: ['ar'],
    title: `${title} — ${siteTagline}`,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} — ${siteTagline}`,
    description,
  },
  // NOTE: do NOT add an `icons` key here. Declaring it overrides the file-based
  // icon conventions wholesale — an `icons: { apple }` alone silently suppressed
  // the `<link rel="icon">` from app/icon.svg, so the tab fell back to the
  // browser's default globe. The favicon (app/icon.svg), the touch icon
  // (app/apple-icon.tsx), the share card (app/{opengraph,twitter}-image.tsx) and
  // the manifest (app/manifest.ts) are all wired by convention instead.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  // Match the app background so the mobile browser chrome blends with the page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0f16' },
  ],
};

// Set the theme class before first paint to avoid a flash (reads localStorage,
// defaults to dark). Mirrors the default in ThemeProvider.
const themeScript = `(function(){try{var t=localStorage.getItem('archivato.theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

// Set <html lang/dir> before first paint from the saved locale (localStorage,
// then cookie) so an Arabic (RTL) user never sees an LTR flash. Mirrors the
// LocaleProvider default.
const localeScript = `(function(){try{var l=localStorage.getItem('archivato.locale');if(!l){var m=document.cookie.match(/archivato_locale=([^;]+)/);l=m&&m[1];}l=(l==='ar')?'ar':'en';var e=document.documentElement;e.lang=l;e.dir=(l==='ar')?'rtl':'ltr';}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <PageviewTracker />
        <ThemeProvider>
          <LocaleProvider>
            <ToastProvider>
              <ConfirmProvider>
                <UpgradeProvider>
                  <AuthGate>{children}</AuthGate>
                </UpgradeProvider>
              </ConfirmProvider>
            </ToastProvider>
            <CookieConsent />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
