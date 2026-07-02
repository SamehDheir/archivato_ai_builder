'use client';

import { AuthForm } from '@/components/auth/AuthForm';

/**
 * Dedicated /login route. Reachable by URL even when already signed in (so you
 * can switch accounts). On success we hard-navigate to the dashboard so the
 * layout-level AuthGate re-checks the session cookie and drops you into the app.
 */
export default function LoginPage() {
  return (
    <AuthForm
      initialMode="login"
      onSuccess={() => window.location.assign('/dashboard')}
    />
  );
}
