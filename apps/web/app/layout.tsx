import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/shared/theme';
import { LocaleProvider } from '@/components/shared/i18n';
import { PageviewTracker } from '@/components/shared/pageview-tracker';
import { CookieConsent } from '@/components/shared/cookie-consent';
import {
  defaultLocale,
  locales,
  LOCALE_COOKIE,
  LOCALE_STORAGE,
  rtlLocales,
} from '@/lib/i18n/settings';
import {
  siteDescription as description,
  siteName as title,
  siteTagline,
  siteUrl,
} from '@/lib/site';

/*
 * Typography. `next/font/google` downloads these at BUILD time and self-hosts
 * them from our own origin — there is no request to Google at runtime, and the
 * generated @font-face carries size-adjust metrics so swapping in the real face
 * causes no layout shift.
 *
 * Loaded here, in the ROOT layout, on purpose: the share page and the landing
 * page are the two surfaces a stranger sees first, and both live outside the
 * `(app)` group. A font loaded in `(app)` would leave exactly those two on the
 * fallback stack.
 */

/*
 * Latin UI face.
 *
 * The weights are enumerated ON PURPOSE — do not "optimise" this back to the
 * variable font by dropping `weight`.
 *
 * Omitting `weight` makes next/font fetch Inter's VARIABLE file
 * (`font-weight: 100 900`). Chromium on Windows rasterises variable fonts with
 * grayscale antialiasing instead of DirectWrite/ClearType subpixel AA, so the
 * text — bold weights worst of all, since more ink means more visible fringing —
 * renders soft and smeared. Static instances take the normal ClearType path and
 * are crisp.
 *
 * The cost is four woff2 files instead of one (~+30KB, cached, subset to latin,
 * non-blocking). That is a fair price for text that isn't blurry for the
 * majority of this audience, who are on Windows.
 *
 * These four are what the app uses: body(400), medium(500), semibold(600),
 * bold(700). Adding a fifth ships another file — and note Tailwind's
 * `font-extrabold`(800)/`font-black`(900) would then FAUX-bold, so don't use
 * them without adding the weight here.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

// Arabic UI face. Not variable upstream, so the weights are enumerated — these
// four are what the app actually uses (body, medium, semibold, bold); adding a
// fifth means shipping another file, so don't unless a design needs it.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-arabic',
});

// Monospace, for the artifact-ish surfaces: the SSE console, SQL/OpenAPI, IDs,
// table names. Subset to latin only — no Arabic identifier ever renders here.
// Static weights, for the same Windows/ClearType reason as Inter above.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

const fontVariables = `${inter.variable} ${plexArabic.variable} ${mono.variable}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${title} — ${siteTagline}`,
    template: '%s · Archivato AI Builder',
  },
  description,
  applicationName: title,
  keywords: [
    'client scoping',
    'client scoping tool',
    'software project scoping',
    'proposal generator for software agencies',
    'software house scoping',
    'project cost estimate',
    'requirements and architecture generator',
    'أداة scoping للمشاريع البرمجية',
    'تقدير تكلفة مشروع برمجي',
    'عرض سعر برمجي للعملاء',
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
  // Mirrors --background in each theme (globals.css). Literal hex is required —
  // a <meta name="theme-color"> is read by the OS browser chrome before any
  // stylesheet resolves, so a var() here would resolve to nothing. The dark
  // value is `brand.ink`; keep all three in step.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F9FAFB' },
    { media: '(prefers-color-scheme: dark)', color: '#0D1317' },
  ],
};

// Set the theme class before first paint to avoid a flash (reads localStorage,
// defaults to dark). Mirrors the default in ThemeProvider.
const themeScript = `(function(){try{var t=localStorage.getItem('archivato.theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

// Set <html lang/dir> before first paint from the saved locale (localStorage,
// then cookie) so an RTL user never sees an LTR flash. Mirrors the LocaleProvider
// default.
//
// BUILT from the locale tables rather than written out, because this is an inline
// string that runs before React and so cannot call `dirFor`. Hand-writing the
// direction test here is how a future RTL locale (he, fa, ur) would translate
// correctly and still paint LTR for the first frame: the app would flip on mount
// and the pre-paint script — the thing whose entire job is preventing that flash —
// would be the one place still saying `=== 'ar'`. Adding to `rtlLocales` is enough.
const localeScript = `(function(){try{
var S=${JSON.stringify(locales)},R=${JSON.stringify(rtlLocales)};
var l=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE)});
if(!l){var m=document.cookie.match(${JSON.stringify(LOCALE_COOKIE)}+"=([^;]+)");l=m&&m[1];}
if(S.indexOf(l)<0)l=${JSON.stringify(defaultLocale)};
var e=document.documentElement;e.lang=l;e.dir=R.indexOf(l)>=0?'rtl':'ltr';
}catch(e){}})();`;

// The cookie-consent banner is server-rendered (part of the first paint — a
// post-hydration mount popped in seconds late and cost Speed Index). For a
// visitor who already chose, hide it before first paint via this class + CSS
// (globals.css `[data-cookie-consent]`); the component unmounts it after.
const consentScript = `(function(){try{var v=localStorage.getItem('archivato.cookieConsent');if(v==='accepted'||v==='declined')document.documentElement.classList.add('consent-done');}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeScript }} />
        <script dangerouslySetInnerHTML={{ __html: consentScript }} />
      </head>
      {/* No `antialiased` class here — it compiles to
          `-webkit-font-smoothing: antialiased`, which kills ClearType subpixel
          rendering on Windows and makes text blurry. See globals.css `body`. */}
      <body className="min-h-screen">
        <PageviewTracker />
        {/* Only theme + locale are global. The app's providers (toast, confirm,
            upgrade) and AuthGate live in the `(app)` route group's layout, so the
            public marketing and legal pages never download or hydrate them. */}
        <ThemeProvider>
          <LocaleProvider>
            {children}
            <CookieConsent />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
