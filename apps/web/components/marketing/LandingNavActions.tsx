'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import { authApi, getAuthHint } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme';
import { LanguageToggle } from '@/components/shared/i18n';

/**
 * The landing nav's right-side actions — the one auth-aware island on the
 * otherwise-static marketing page.
 *
 * Signed-in visitors see a single "Dashboard" button (instead of the signed-out
 * Sign in / Start building CTAs); they are NOT redirected, so they can browse
 * the marketing page freely. To avoid a flash of the wrong controls we seed from
 * the cached auth hint on mount (instant, no flicker), then confirm with a real
 * `/auth/me` check. This is the deliberate exception to "public routes skip the
 * auth round-trip"; it never blocks the page render for signed-out visitors.
 */
export function LandingNavActions() {
  const { t } = useTranslation('marketing');
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    // Optimistically render from the last-known state so returning visitors get
    // the right button on the first frame; then verify against the server.
    setAuthed(getAuthHint());
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
      <LanguageToggle />
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
