'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const { t } = useTranslation('common');
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-7 w-7" />
      </span>
      <p className="mt-6 font-mono text-sm uppercase tracking-[0.25em] text-muted-foreground">
        {t('notFound.badge')}
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {t('notFound.title')}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('notFound.body')}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">
            {t('notFound.toDashboard')}{' '}
            <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t('notFound.toHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
