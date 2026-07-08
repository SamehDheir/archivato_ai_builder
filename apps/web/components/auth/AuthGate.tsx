'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Loader2, LifeBuoy } from 'lucide-react';
import { isStaffUser, type AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AuthForm } from '@/components/auth/AuthForm';
import { ThemeToggle } from '@/components/shared/theme';
import { LanguageMenu } from '@/components/shared/LanguageMenu';
import { Logo } from '@/components/shared/Logo';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { AccountMenu } from '@/components/shared/AccountMenu';

/** Always-public routes, matched by prefix (rendered regardless of auth state). */
const PUBLIC_PREFIXES = ['/verify'];
/** Always-public routes, matched exactly (e.g. the marketing landing at `/`). */
const PUBLIC_EXACT = ['/', '/privacy', '/terms'];
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
  const headerRef = useRef<HTMLElement | null>(null);

  // Publish the real header height as --app-header-h so sticky consumers (the
  // admin sidebar) never depend on a hard-coded pixel value or overlap a taller
  // header. The CSS default covers SSR / first paint.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty(
        '--app-header-h',
        `${el.offsetHeight}px`,
      );
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [user]);

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

  // Keep the header's role-based links (support / admin) in sync when the tab
  // regains focus or is restored from bfcache — a revoked permission drops its
  // link without a hard reload (permissions resolve fresh server-side).
  useEffect(() => {
    if (isPublic) return;
    const revalidate = () => authApi.me().then(setUser).catch(() => undefined);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void revalidate();
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
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
          <LanguageMenu />
          <ThemeToggle />
        </div>
        <AuthForm onSuccess={setUser} />
      </>
    );
  }

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background/80 px-5 py-3 backdrop-blur"
      >
        {/* Home button: back to the dashboard (the app's home once signed in). */}
        <Link
          href="/dashboard"
          aria-label={t('header.dashboard')}
          className="rounded-md transition-opacity hover:opacity-80"
        >
          <Logo />
        </Link>

        <div className="ms-auto flex items-center gap-1">
          <LanguageMenu />
          <ThemeToggle />
          {/* Support: customers reach their Support Center from the header. Staff
              navigate their consoles (support, admin, billing…) via the admin
              sidebar instead, so no header links are shown for them. */}
          {!isStaffUser(user.permissions) && (
            <Button asChild variant="ghost" size="sm" aria-label={t('header.support')}>
              <Link href="/support">
                <LifeBuoy className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <NotificationBell />
          {/* Divider between utility controls and the account menu. */}
          <span className="mx-1.5 hidden h-6 w-px bg-border sm:block" aria-hidden />
          <AccountMenu user={user} onLogout={handleLogout} />
        </div>
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
