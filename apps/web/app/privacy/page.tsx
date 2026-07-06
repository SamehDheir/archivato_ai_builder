import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <LegalDocument doc="privacy" />;
}
