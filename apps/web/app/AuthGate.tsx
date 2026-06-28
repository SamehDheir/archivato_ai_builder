'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '../lib/api';
import { AuthForm } from './AuthForm';

/** Always-public routes (rendered regardless of auth state). */
const PUBLIC_PATHS = ['/verify'];
/** Guest-only routes: signed-in users are redirected home, can't view these. */
const GUEST_ONLY_PATHS = ['/login', '/register'];

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="container">
      <div className="loading-screen">
        <div className="spinner" />
        <p className="subtitle" style={{ margin: 0 }}>
          {label}
        </p>
      </div>
    </div>
  );
}

/**
 * Gates the app behind authentication (Slice 9). Checks the session on mount
 * via the httpOnly access cookie; shows a login/register screen when signed
 * out, and a header (with email-verification prompt + sign out) when signed in.
 *
 * Routing rules:
 *  - `/verify*` is public (the email link works whether or not you're signed in).
 *  - `/login` and `/register` are guest-only — signed-in users are redirected
 *    to `/` and cannot view them.
 *  - everything else requires a session.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
  const isGuestOnly = GUEST_ONLY_PATHS.some((p) => pathname === p);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .finally(() => setChecking(false));
  }, []);

  // Keep signed-in users out of the login/register pages.
  useEffect(() => {
    if (!checking && user && isGuestOnly) {
      router.replace('/');
    }
  }, [checking, user, isGuestOnly, router]);

  async function handleLogout() {
    await authApi.logout().catch(() => undefined);
    setUser(null);
  }

  // Always-public routes render for everyone.
  if (isPublic) {
    return <>{children}</>;
  }

  if (checking) {
    return <LoadingScreen label="Loading your workspace…" />;
  }

  // Guest-only pages: render the form when signed out; redirect (above) otherwise.
  if (isGuestOnly) {
    if (user) return <LoadingScreen label="Redirecting…" />;
    return <>{children}</>;
  }

  if (!user) {
    return <AuthForm onSuccess={setUser} />;
  }

  return (
    <>
      <header className="authbar">
        <span className="brand">Archivato</span>
        <span className="authbar-spacer" />
        <span className="authbar-user">
          {user.displayName}
          {!user.emailVerified && (
            <span className="badge-warn" title="Email not verified">
              unverified
            </span>
          )}
        </span>
        <button className="secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      {!user.emailVerified && <VerifyBanner email={user.email} />}

      {children}
    </>
  );
}

/** Prompt + resend control shown to signed-in users who haven't verified. */
function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  async function resend() {
    setState('sending');
    try {
      await authApi.resendVerification();
      setState('sent');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="container" style={{ paddingBottom: 0 }}>
      <div className="notice info">
        Please verify your email (<strong>{email}</strong>) — check your inbox
        for the confirmation link.{' '}
        {state === 'sent' ? (
          <strong>Verification email sent.</strong>
        ) : (
          <button
            className="linklike"
            onClick={resend}
            disabled={state === 'sending'}
          >
            {state === 'sending' ? 'Sending…' : 'Resend email'}
          </button>
        )}
        {state === 'error' && (
          <span className="error" style={{ marginLeft: 8 }}>
            Could not send — try again.
          </span>
        )}
      </div>
    </div>
  );
}
