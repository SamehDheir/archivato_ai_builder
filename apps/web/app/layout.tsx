import type { Metadata } from 'next';
import './globals.css';
import { AuthGate } from './AuthGate';
import { ToastProvider } from './toast';
import { ThemeProvider } from './theme';

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
        <ThemeProvider>
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
