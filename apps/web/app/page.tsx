import { redirect } from 'next/navigation';

/**
 * The app has no marketing landing page — the root path forwards straight to the
 * dashboard (which is auth-gated by the layout's AuthGate).
 */
export default function Home() {
  redirect('/dashboard');
}
