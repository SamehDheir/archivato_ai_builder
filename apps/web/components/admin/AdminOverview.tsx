'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { Permission } from '@archivato/shared';
import { Card } from '@/components/ui/card';
import { visibleNav } from '@/components/admin/admin-nav';

/**
 * The staff "home base" — a welcome header plus a card per console the viewer's
 * roles grant (the union of their permissions). Rendered inside the AdminShell
 * on `/dashboard` for staff, replacing the project creator they can't use.
 */
export function AdminOverview({ permissions }: { permissions: Permission[] }) {
  const { t } = useTranslation('admin');

  // Every console the viewer can reach (skip the Overview self-link).
  const consoles = visibleNav(permissions)
    .flatMap((g) => g.items)
    .filter((i) => i.key !== 'overview');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('overview.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('overview.subtitle')}</p>
      </div>

      {consoles.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t('overview.empty')}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {consoles.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} href={item.href} className="group">
                <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-primary/40">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-3 font-semibold">{t(`nav.${item.labelKey}`)}</h2>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">
                    {t(`overview.desc.${item.key}`)}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {t('overview.open')}
                    <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
