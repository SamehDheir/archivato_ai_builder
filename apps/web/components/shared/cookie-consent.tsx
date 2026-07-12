'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getConsent, setConsent, type ConsentValue } from '@/lib/consent';

/**
 * Bottom-anchored cookie-consent banner. Shown until the visitor makes a choice;
 * governs the analytics beacon only (essential cookies always run). Renders on
 * every page (it sits outside AuthGate), and is i18n'd + RTL-safe.
 *
 * Render strategy: the banner is **part of the server HTML** (initial state
 * visible), so for a new visitor it belongs to the very first paint. Mounting it
 * only after hydration made it pop into view seconds late on a slow network,
 * which Lighthouse's filmstrip read as the page still visually changing — a
 * direct Speed Index penalty. Visitors who already chose are handled by the
 * pre-paint consent script in the root layout: it sets `.consent-done` on
 * `<html>` before first paint and CSS hides the banner, so they see no flash;
 * the mount effect then removes it from the DOM for real.
 */
export function CookieConsent() {
  const { t } = useTranslation('legal');
  // Matches the SSR output (visible) to keep hydration clean; corrected on mount.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  if (!visible) return null;

  const choose = (value: ConsentValue) => {
    setConsent(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={t('consent.privacyLink')}
      dir="auto"
      data-cookie-consent
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-5 py-4 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          {t('consent.message')}{' '}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {t('consent.privacyLink')}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2 sm:ms-auto">
          <Button variant="secondary" size="sm" onClick={() => choose('declined')}>
            {t('consent.decline')}
          </Button>
          <Button size="sm" onClick={() => choose('accepted')}>
            {t('consent.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
