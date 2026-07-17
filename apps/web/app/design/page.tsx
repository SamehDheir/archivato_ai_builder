import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DesignSystemPage } from '@/components/design-system/DesignSystemPage';

/**
 * The design-system reference: every token and every shared component variant on
 * one page, so future work has something to converge ON rather than inventing a
 * fourth way to draw a chip.
 *
 * **Dev-only.** It 404s in production rather than shipping an internal reference
 * on the marketing domain. That also keeps it out of the route manifest a
 * visitor downloads — this page imports nearly every UI component, so leaving it
 * in a production build would be a real chunk for zero customer value.
 *
 * Deliberately NOT Storybook: that's a second build, a second dep tree, and a
 * second place for the theme to drift. This renders inside the real app shell
 * with the real tokens, so the theme toggle and the RTL flip exercise it exactly
 * as a real page would.
 */
export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignSystemPage />;
}
