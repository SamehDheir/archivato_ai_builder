import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Terms of Service',
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
