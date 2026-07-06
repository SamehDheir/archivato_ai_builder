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
 */
export function CookieConsent() {
  const { t } = useTranslation('legal');
  // Start hidden; decide on mount so SSR/first paint never flashes the banner
  // for a visitor who already chose.
  const [visible, setVisible] = useState(false);

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
