'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  LifeBuoy,
  Settings as SettingsIcon,
  ShieldCheck,
} from 'lucide-react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuthForm } from '@/components/auth/AuthForm';
import { ThemeToggle } from '@/components/shared/theme';
import { LanguageToggle } from '@/components/shared/i18n';
import { Logo } from '@/components/shared/Logo';

/** Always-public routes, matched by prefix (rendered regardless of auth state). */
const PUBLIC_PREFIXES = ['/verify'];
/** Always-public routes, matched exactly (e.g. the marketing landing at `/`). */
const PUBLIC_EXACT = ['/'];
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
  const { t } = useTranslation('common');

  const isPublic =
    PUBLIC_EXACT.includes(pathname ?? '') ||
    PUBLIC_PREFIXES.some((p) => pathname?.startsWith(p));
  const isGuestOnly = GUEST_ONLY_PATHS.some((p) => pathname === p);

  useEffect(() => {
    // Public routes (landing, verify) render without knowing the user — skip the
    // auth round-trip (and its 401 → refresh attempt) entirely.
    if (isPublic) {
      setChecking(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .finally(() => setChecking(false));
  }, [isPublic]);

  useEffect(() => {
    if (!checking && user && isGuestOnly) {
      router.replace('/dashboard');
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
    return <LoadingScreen label={t('loading.workspace')} />;
  }

  if (isGuestOnly) {
    if (user) return <LoadingScreen label={t('loading.redirecting')} />;
    return <>{children}</>;
  }

  if (!user) {
    return (
      <>
        <div className="fixed end-4 top-4 z-50 flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <AuthForm onSuccess={setUser} />
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/80 px-5 py-3 backdrop-blur">
        {/* Home button: back to the dashboard (the app's home once signed in). */}
        <Link
          href="/dashboard"
          aria-label={t('header.dashboard')}
          className="rounded-md transition-opacity hover:opacity-80"
        >
          <Logo />
        </Link>
        <span className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
          {user.displayName}
          {!user.emailVerified && (
            <Badge variant="warning" title={t('header.emailNotVerified')}>
              {t('header.unverified')}
            </Badge>
          )}
        </span>
        <LanguageToggle />
        <ThemeToggle />
        <Button asChild variant="ghost" size="sm" aria-label={t('header.support')}>
          <Link href="/support">
            <LifeBuoy className="h-4 w-4" />
          </Link>
        </Button>
        {user.role === 'admin' && (
          <Button asChild variant="ghost" size="sm" aria-label={t('header.admin')}>
            <Link href="/admin">
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" aria-label={t('header.settings')}>
          <Link href="/settings">
            <SettingsIcon className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          {t('header.signOut')}
        </Button>
      </header>

      {!user.emailVerified && <VerifyBanner email={user.email} />}

      {children}
    </>
  );
}

/** Prompt + resend control shown to signed-in users who haven't verified. */
function VerifyBanner({ email }: { email: string }) {
  const { t } = useTranslation('common');
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
      <div
        dir="auto"
        className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
      >
        {t('verify.pre')}
        <strong>{email}</strong>
        {t('verify.post')}{' '}
        {state === 'sent' ? (
          <strong>{t('verify.sent')}</strong>
        ) : (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={resend}
            disabled={state === 'sending'}
          >
            {state === 'sending' ? t('verify.sending') : t('verify.resend')}
          </Button>
        )}
        {state === 'error' && (
          <span className="ms-2 text-destructive">{t('verify.error')}</span>
        )}
      </div>
    </div>
  );
}
