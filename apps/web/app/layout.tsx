import type { Metadata } from 'next';
import './globals.css';
import { AuthGate } from './AuthGate';
import { ToastProvider } from './toast';

export const metadata: Metadata = {
  title: 'Archivato AI Builder',
  description: 'Turn a business idea into a complete software system design.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <ToastProvider>
          <AuthGate>{children}</AuthGate>
        </ToastProvider>
      </body>
    </html>
  );
}
