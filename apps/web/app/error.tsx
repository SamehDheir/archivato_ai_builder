'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * App-wide client error boundary. Next renders this when a route throws during
 * render — replacing the default dev overlay / blank screen with a branded,
 * recoverable fallback (`reset()` re-renders the segment).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation('common');
  useEffect(() => {
    // Surface the error for debugging (and any wired-up client logging).
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <p className="mt-6 font-mono text-sm uppercase tracking-[0.25em] text-muted-foreground">
        {t('error.badge')}
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {t('error.title')}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('error.body')}</p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground/70" dir="ltr">
          {t('error.reference', { digest: error.digest })}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>
          <RotateCw className="h-4 w-4" /> {t('error.retry')}
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">{t('error.toDashboard')}</Link>
        </Button>
      </div>
    </div>
  );
}
