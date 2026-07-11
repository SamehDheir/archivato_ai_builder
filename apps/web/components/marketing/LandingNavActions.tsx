'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import { authApi, getAuthHint } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme';
import { LanguageMenu } from '@/components/shared/LanguageMenu';

/**
 * The landing nav's right-side actions — the one auth-aware island on the
 * otherwise-static marketing page.
 *
 * Signed-in visitors see a single "Dashboard" button (instead of the signed-out
 * Sign in / Start building CTAs); they are NOT redirected, so they can browse
 * the marketing page freely.
 *
 * **An anonymous visitor makes no API call at all.** We only hit `/auth/me` when
 * the cached hint says the user was signed in on this device. Firing it
 * unconditionally meant every first-time visitor triggered a `401`, which the
 * browser logs to the console — costing a Lighthouse Best-Practices point — and
 * cost a round-trip to a possibly-cold API for a result we could already predict.
 *
 * Trusting the hint is safe *here* because this choice is cosmetic — which pair
 * of buttons to paint. It is not an authorization decision: every protected route
 * still re-checks with the server via AuthGate, and every API is gated server-side.
 * Worst case (cookie present but localStorage cleared) a signed-in user sees the
 * signed-out CTAs on the marketing page; following either one lands them in the
 * app, where AuthGate corrects the state.
 */
export function LandingNavActions() {
  const { t } = useTranslation('marketing');
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const hint = getAuthHint();
    if (hint !== true) {
      // Never signed in on this device (or known signed out) — paint the guest
      // CTAs and skip the network entirely.
      setAuthed(false);
      return;
    }
    // Optimistically render the signed-in button on the first frame (no flicker),
    // then confirm against the server in case the session has since expired.
    setAuthed(true);
    let active = true;
    authApi
      .me()
      .then((user) => active && setAuthed(Boolean(user)))
      .catch(() => active && setAuthed(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="ms-auto flex items-center gap-2">
      <LanguageMenu />
      <ThemeToggle />
      {authed === true && (
        <Button asChild size="sm">
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" /> {t('nav.dashboard')}
          </Link>
        </Button>
      )}
      {authed === false && (
        <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href="/login">{t('nav.signIn')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard">
              {t('nav.startBuilding')}{' '}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
