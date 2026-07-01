'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuthForm } from '@/components/auth/AuthForm';
import { ThemeToggle } from '@/components/shared/theme';

/** Always-public routes (rendered regardless of auth state). */
const PUBLIC_PATHS = ['/verify'];
/** Guest-only routes: signed-in users are redirected home, can't view these. */
const GUEST_ONLY_PATHS = ['/login', '/register'];

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/**
 * Gates the app behind authentication (Slice 9). Shows a login/register screen
 * when signed out, and a header (with email-verification prompt + sign out)
 * when signed in.
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

  useEffect(() => {
    if (!checking && user && isGuestOnly) {
      router.replace('/');
    }
  }, [checking, user, isGuestOnly, router]);

  async function handleLogout() {
    await authApi.logout().catch(() => undefined);
    setUser(null);
  }

  if (isPublic) {
    return <>{children}</>;
  }

  if (checking) {
    return <LoadingScreen label="Loading your workspace…" />;
  }

  if (isGuestOnly) {
    if (user) return <LoadingScreen label="Redirecting…" />;
    return <>{children}</>;
  }

  if (!user) {
    return (
      <>
        <ThemeToggle className="fixed right-4 top-4 z-50" />
        <AuthForm onSuccess={setUser} />
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/80 px-5 py-3 backdrop-blur">
        <span className="font-bold">Archivato</span>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {user.displayName}
          {!user.emailVerified && (
            <Badge variant="warning" title="Email not verified">
              unverified
            </Badge>
          )}
        </span>
        <ThemeToggle />
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          Sign out
        </Button>
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
    <div className="mx-auto max-w-3xl px-5 pt-5">
      <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
        Please verify your email (<strong>{email}</strong>) — check your inbox
        for the confirmation link.{' '}
        {state === 'sent' ? (
          <strong>Verification email sent.</strong>
        ) : (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={resend}
            disabled={state === 'sending'}
          >
            {state === 'sending' ? 'Sending…' : 'Resend email'}
          </Button>
        )}
        {state === 'error' && (
          <span className="ml-2 text-destructive">Could not send — try again.</span>
        )}
      </div>
    </div>
  );
}
