import type { Metadata } from 'next';
import './globals.css';
import { AuthGate } from './AuthGate';

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
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
