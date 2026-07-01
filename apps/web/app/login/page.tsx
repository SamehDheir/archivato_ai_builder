'use client';

import { AuthForm } from '@/components/auth/AuthForm';

/**
 * Dedicated /login route. Reachable by URL even when already signed in (so you
 * can switch accounts). On success we hard-navigate home so the layout-level
 * AuthGate re-checks the session cookie.
 */
export default function LoginPage() {
  return <AuthForm initialMode="login" onSuccess={() => window.location.assign('/')} />;
}
