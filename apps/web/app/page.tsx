import { LandingPage } from '@/components/marketing/LandingPage';

/**
 * The public marketing landing page at `/` (AuthGate treats `/` as public).
 * Signed-in users can jump into the auth-gated app at `/dashboard`.
 */
export default function Home() {
  return <LandingPage />;
}
