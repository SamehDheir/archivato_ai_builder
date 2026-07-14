'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  CreditCard,
  Eye,
  FolderKanban,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  hasPermission,
  type AdminStats,
  type AdminTraffic,
  type TimePoint,
} from '@archivato/shared';
import { adminApi, authApi, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { LlmUsagePanel } from '@/components/admin/LlmUsagePanel';

/**
 * SuperAdmin dashboard: real product KPIs (users, projects, subscriptions),
 * 30-day signup/traffic trends, top pages/referrers, and a user management
 * table. Guards itself — a non-admin (or a 403 from the API) bounces to the app.
 */
export function AdminDashboard() {
  const router = useRouter();
  const { t } = useTranslation('admin');
  const fmt = useFormat();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [traffic, setTraffic] = useState<AdminTraffic | null>(null);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.me().catch(() => null);
        if (!hasPermission(me?.permissions, 'admin:analytics')) {
          router.replace('/dashboard');
          return;
        }
        if (!cancelled) {
          setCanManageRoles(hasPermission(me?.permissions, 'admin:roles:manage'));
        }
        const [s, t] = await Promise.all([adminApi.stats(), adminApi.traffic()]);
        if (!cancelled) {
          setStats(s);
          setTraffic(t);
        }
      } catch (e) {
        // A 403 means we're not actually admin — leave.
        if (e instanceof ApiError && e.status === 403) router.replace('/dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading || !stats) {
    return (
      <div>
        <Skeleton className="h-8 w-56" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-6 h-48 w-full rounded-lg" />
      </div>
    );
  }

  const o = stats.overview;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('title')}</h1>
        </div>
        {canManageRoles && (
          <Link
            href="/admin/roles"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/50"
          >
            <ShieldCheck className="h-4 w-4" /> {t('roles.link')}
          </Link>
        )}
      </div>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={Users}
          label={t('kpi.users')}
          value={o.users.total}
          sub={t('kpi.usersNew', { count: o.users.new30d })}
        />
        <StatTile
          icon={FolderKanban}
          label={t('kpi.projects')}
          value={o.projects.total}
          sub={t('kpi.projectsConfirmed', { count: o.projects.byStatus.confirmed })}
        />
        <StatTile
          icon={CreditCard}
          label={t('kpi.proSubscribers')}
          value={o.subscriptions.pro}
          sub={t('kpi.mrr', { amount: o.subscriptions.mrrUsd })}
          accent
        />
        <StatTile
          icon={Sparkles}
          label={t('kpi.generations')}
          value={o.generations.total}
          sub={t('kpi.generations7d', { count: o.generations.last7d })}
        />
        <StatTile
          icon={Eye}
          label={t('kpi.pageviews7d')}
          value={o.traffic.pageviews7d}
        />
        <StatTile
          icon={UserCheck}
          label={t('kpi.uniqueVisitors7d')}
          value={o.traffic.uniqueVisitors7d}
        />
        <StatTile
          icon={Activity}
          label={t('kpi.activeUsers7d')}
          value={o.traffic.activeUsers7d}
        />
        <StatTile
          icon={Users}
          label={t('kpi.verified')}
          value={o.users.verified}
          sub={t('kpi.admins', { count: o.users.admins })}
        />
      </div>

      {/* Trend charts */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TrendChart
          title={t('charts.signups')}
          subtitle={t('charts.last30')}
          data={stats.signups}
        />
        <TrendChart
          title={t('charts.pageviews')}
          subtitle={t('charts.last30')}
          data={stats.pageviews}
        />
      </div>

      {/* Projects by status + subscription mix */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">{t('projectsByStatus')}</h3>
            <BarList
              items={(
                Object.keys(o.projects.byStatus) as (keyof typeof o.projects.byStatus)[]
              ).map((k) => ({
                label: t(`status.${k}`, { defaultValue: k }),
                count: o.projects.byStatus[k],
              }))}
              empty={t('noData')}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">{t('planMix')}</h3>
            <BarList
              items={[
                { label: t('free'), count: o.subscriptions.free },
                { label: t('pro'), count: o.subscriptions.pro },
              ]}
              empty={t('noData')}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {t('estimatedMrr')}{' '}
              <span className="font-semibold text-foreground">
                {t('kpi.mrr', { amount: o.subscriptions.mrrUsd })}
              </span>{' '}
              {t('mrrFrom', { count: o.subscriptions.pro })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Traffic detail */}
      {traffic && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">{t('topPages')}</h3>
              <BarList
                items={traffic.topPages.map((p) => ({
                  label: p.path,
                  count: p.count,
                }))}
                empty={t('noPageviews')}
                mono
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">{t('topReferrers')}</h3>
              <BarList
                items={traffic.topReferrers.map((r) => ({
                  label: r.referrer,
                  count: r.count,
                }))}
                empty={t('noReferrers')}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">{t('topCountries')}</h3>
              <BarList
                items={(traffic.topCountries ?? []).map((c) => ({
                  label: fmt.country(c.country),
                  count: c.count,
                }))}
                empty={t('noCountries')}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI spend — what the model providers cost us */}
      <LlmUsagePanel />

      {/* Users table */}
      <div className="mt-4">
        <AdminUsersTable />
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'border-primary/40 bg-primary/5' : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">
          {value.toLocaleString()}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/** A lightweight area+line chart for a dense daily series (theme-tinted SVG). */
function TrendChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: TimePoint[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 320;
  const h = 72;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map(
    (d, i) => [i * step, h - (d.value / max) * (h - 8) - 4] as const,
  );
  const line = pts
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const area = pts.length ? `${line} L${w},${h} L0,${h} Z` : '';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
          <span className="text-lg font-bold tabular-nums">
            {total.toLocaleString()}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-20 w-full"
          role="img"
          aria-label={`${title}: ${total} total over ${data.length} days`}
        >
          {area && <path d={area} fill="hsl(var(--primary) / 0.12)" />}
          {line && (
            <path
              d={line}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{data[0]?.date.slice(5)}</span>
          <span>{data[data.length - 1]?.date.slice(5)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Horizontal bar list (top pages/referrers, status/plan mix). */
function BarList({
  items,
  empty = 'No data yet.',
  mono,
}: {
  items: { label: string; count: number }[];
  empty?: string;
  mono?: boolean;
}) {
  if (items.length === 0 || items.every((i) => i.count === 0)) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className={`truncate ${mono ? 'font-mono' : ''}`} title={it.label}>
              {it.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {it.count.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(it.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
