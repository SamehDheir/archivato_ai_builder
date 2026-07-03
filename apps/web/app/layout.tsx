import type { Metadata } from 'next';
import './globals.css';
import { AuthGate } from '@/components/auth/AuthGate';
import { ToastProvider } from '@/components/shared/toast';
import { ThemeProvider } from '@/components/shared/theme';
import { ConfirmProvider } from '@/components/shared/confirm-dialog';
import { UpgradeProvider } from '@/components/billing/upgrade-dialog';
import { PageviewTracker } from '@/components/shared/pageview-tracker';

export const metadata: Metadata = {
  title: 'Archivato AI Builder',
  description: 'Turn a business idea into a complete software system design.',
};

// Set the theme class before first paint to avoid a flash (reads localStorage,
// defaults to dark). Mirrors the default in ThemeProvider.
const themeScript = `(function(){try{var t=localStorage.getItem('archivato.theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <PageviewTracker />
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <UpgradeProvider>
                <AuthGate>{children}</AuthGate>
              </UpgradeProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
