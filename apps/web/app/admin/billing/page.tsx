'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CreditCard,
  TrendingUp,
  Users,
  XCircle,
  AlertTriangle,
  Download,
  Search,
  Loader2,
  ExternalLink,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import {
  hasPermission,
  type BillingAdminData,
  type BillingAdminFilter,
  type BillingSubscriptionDetail,
  type BillingSubscriptionRow,
  type BillingTrends,
  type SubscriptionStatus,
} from '@archivato/shared';
import { ApiError, authApi, billingAdminApi } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';

const STATUS_VARIANT: Record<SubscriptionStatus, 'default' | 'warning' | 'secondary'> = {
  active: 'default',
  past_due: 'warning',
  canceled: 'secondary',
};
const PAGE_SIZE = 25;

/** A headline KPI tile. */
function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight" dir="ltr">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/** A compact dual-line 30-day trend chart (new Pro vs churn). */
function TrendChart({ trends }: { trends: BillingTrends }) {
  const { t } = useTranslation('billing');
  const W = 640;
  const H = 120;
  const pad = 6;
  const pts = trends.newPro.length;
  const max = Math.max(
    1,
    ...trends.newPro.map((p) => p.value),
    ...trends.churn.map((p) => p.value),
  );
  const line = (series: { value: number }[]) =>
    series
      .map((p, i) => {
        const x = pad + (i / Math.max(1, pts - 1)) * (W - pad * 2);
        const y = H - pad - (p.value / max) * (H - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> {t('admin.trends.title')}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" /> {t('admin.trends.newPro')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" /> {t('admin.trends.churn')}
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-28 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={line(trends.newPro)} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />
        <path d={line(trends.churn)} fill="none" stroke="hsl(var(--destructive))" strokeWidth={2} />
      </svg>
      <div className="mt-1 text-xs text-muted-foreground">{t('admin.trends.last30')}</div>
    </Card>
  );
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function BillingAdminPage() {
  const { t } = useTranslation('billing');
  const fmt = useFormat();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [ready, setReady] = useState(false);
  const [data, setData] = useState<BillingAdminData | null>(null);
  const [trends, setTrends] = useState<BillingTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filter controls.
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<'' | 'free' | 'pro'>('');
  const [status, setStatus] = useState<'' | SubscriptionStatus>('');
  const [page, setPage] = useState(1);

  const filter = useMemo<BillingAdminFilter>(
    () => ({
      q: q || undefined,
      plan: plan || undefined,
      status: status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, plan, status, page],
  );

  const load = useCallback(
    (f: BillingAdminFilter) => {
      setLoading(true);
      billingAdminApi
        .overview(f)
        .then(setData)
        .catch((e) =>
          toast({
            title: t('admin.loadFailed'),
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          }),
        )
        .finally(() => setLoading(false));
    },
    [t, toast],
  );

  // Guard, then load KPIs + first page + trends.
  useEffect(() => {
    authApi.me().then((me) => {
      if (!hasPermission(me?.permissions, 'billing:manage')) {
        router.replace('/dashboard');
        return;
      }
      setReady(true);
      billingAdminApi.trends().then(setTrends).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the table whenever the filter changes (debounced for the search box).
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => load(filter), 250);
    return () => clearTimeout(id);
  }, [ready, filter, load]);

  function resetToFirstPage() {
    setPage(1);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await billingAdminApi.overview({ ...filter, page: 1, pageSize: 200 });
      const header = [
        'Name',
        'Email',
        'Plan',
        'Status',
        'Renews',
        'CancelAtPeriodEnd',
        'Updated',
      ];
      const lines = all.subscriptions.map((r) =>
        [
          r.displayName,
          r.email,
          r.effectivePlan,
          r.status,
          r.periodEnd ?? '',
          r.cancelAtPeriodEnd,
          r.updatedAt,
        ]
          .map(csvCell)
          .join(','),
      );
      const csv = [header.join(','), ...lines].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: t('admin.exportFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setExporting(false);
    }
  }

  /** Merge an updated detail (after grant/revoke) back into the visible row. */
  function applyDetail(d: BillingSubscriptionDetail) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            subscriptions: prev.subscriptions.map((r) =>
              r.userId === d.userId ? { ...r, ...toRow(d) } : r,
            ),
          }
        : prev,
    );
    // KPIs may have shifted — refresh them quietly.
    billingAdminApi.overview(filter).then(setData).catch(() => undefined);
    billingAdminApi.trends().then(setTrends).catch(() => undefined);
  }

  if (!ready) return null;

  const s = data?.summary;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {t('admin.back')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{t('admin.title')}</h1>
        </div>
        {s && (
          <Badge variant="secondary">
            {t('admin.providerLabel')}: {t(`admin.providers.${s.provider}`)}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('admin.subtitle')}</p>

      {/* KPIs */}
      {loading && !s ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        s && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icon={TrendingUp} label={t('admin.kpi.mrr')} value={`$${fmt.number(s.mrrUsd)}`} hint={t('admin.kpi.mrrHint')} />
            <Kpi icon={CreditCard} label={t('admin.kpi.proActive')} value={fmt.number(s.proActive)} />
            <Kpi icon={Users} label={t('admin.kpi.free')} value={fmt.number(s.free)} hint={t('admin.kpi.ofTotal', { total: fmt.number(s.totalUsers) })} />
            <Kpi icon={TrendingUp} label={t('admin.kpi.arpu')} value={`$${fmt.number(s.arpuUsd)}`} />
            <Kpi icon={XCircle} label={t('admin.kpi.canceling')} value={fmt.number(s.canceling)} />
            <Kpi icon={AlertTriangle} label={t('admin.kpi.pastDue')} value={fmt.number(s.pastDue)} />
          </div>
        )
      )}

      {/* Trend chart */}
      {trends && (
        <div className="mt-4">
          <TrendChart trends={trends} />
        </div>
      )}

      {/* Filters */}
      <div className="mt-8 flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              dir="ltr"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                resetToFirstPage();
              }}
              placeholder={t('admin.filters.search')}
              className="ps-9"
            />
          </div>
        </div>
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value as typeof plan);
            resetToFirstPage();
          }}
          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('admin.filters.allPlans')}</option>
          <option value="pro">{t('admin.plan.pro')}</option>
          <option value="free">{t('admin.plan.free')}</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            resetToFirstPage();
          }}
          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('admin.filters.allStatuses')}</option>
          <option value="active">{t('admin.status.active')}</option>
          <option value="canceled">{t('admin.status.canceled')}</option>
          <option value="past_due">{t('admin.status.past_due')}</option>
        </select>
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t('admin.filters.exportCsv')}
        </Button>
      </div>

      {/* Subscriptions table */}
      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : !data || data.subscriptions.length === 0 ? (
        <Card className="mt-4 p-8 text-center text-sm text-muted-foreground">
          {t('admin.table.empty')}
        </Card>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('admin.table.customer')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('admin.table.plan')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('admin.table.status')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('admin.table.renews')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('admin.table.updated')}</th>
                  <th className="px-4 py-2.5 text-end font-medium">{t('admin.table.manage')}</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((row) => (
                  <SubscriptionRow
                    key={row.userId}
                    row={row}
                    onApplied={applyDetail}
                    confirm={confirm}
                    toast={toast}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{t('admin.table.subtitle', { n: fmt.number(data.total) })}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('admin.page.prev')}
              </Button>
              <span>{t('admin.page.of', { page, pages: totalPages })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('admin.page.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Convert a detail back to the row shape (for in-place table updates). */
function toRow(d: BillingSubscriptionDetail): BillingSubscriptionRow {
  return {
    userId: d.userId,
    email: d.email,
    displayName: d.displayName,
    plan: d.plan,
    effectivePlan: d.effectivePlan,
    status: d.status,
    cancelAtPeriodEnd: d.cancelAtPeriodEnd,
    periodEnd: d.periodEnd,
    billingCycle: d.billingCycle,
    paddle: d.paddle,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function SubscriptionRow({
  row,
  onApplied,
  confirm,
  toast,
}: {
  row: BillingSubscriptionRow;
  onApplied: (d: BillingSubscriptionDetail) => void;
  confirm: ReturnType<typeof useConfirm>;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useTranslation('billing');
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<BillingSubscriptionDetail | null>(null);
  const [busy, setBusy] = useState(false);

  async function expand() {
    setOpen((o) => !o);
    if (!detail) {
      try {
        setDetail(await billingAdminApi.detail(row.userId));
      } catch {
        /* leave collapsed content empty */
      }
    }
  }

  async function act(kind: 'grant' | 'revoke') {
    const ok = await confirm({
      title: t(`admin.actions.${kind}ConfirmTitle`, { name: row.displayName }),
      description: t(`admin.actions.${kind}ConfirmBody`),
      confirmLabel: t(`admin.actions.${kind}`),
      destructive: kind === 'revoke',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated =
        kind === 'grant'
          ? await billingAdminApi.grantPro(row.userId)
          : await billingAdminApi.revoke(row.userId);
      setDetail(updated);
      onApplied(updated);
      toast({ title: t(`admin.actions.${kind}Done`), variant: 'success' });
    } catch (e) {
      const msg =
        e instanceof ApiError && e.code === 'paddle_managed'
          ? t('admin.actions.paddleManaged')
          : e instanceof Error
            ? e.message
            : String(e);
      toast({ title: t('admin.actions.failed'), description: msg, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-border/60 last:border-0">
        <td className="px-4 py-3">
          <div className="font-medium">{row.displayName}</div>
          <div dir="ltr" className="text-xs text-muted-foreground">
            {row.email}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant={row.effectivePlan === 'pro' ? 'primary' : 'secondary'}>
            {t(`admin.plan.${row.effectivePlan}`)}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANT[row.status]}>{t(`admin.status.${row.status}`)}</Badge>
          {row.cancelAtPeriodEnd && (
            <div className="mt-0.5 text-xs text-warning">{t('admin.table.cancels')}</div>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground" dir="ltr">
          {row.periodEnd ? fmt.date(row.periodEnd) : t('admin.table.noEnd')}
        </td>
        <td className="px-4 py-3 text-muted-foreground" dir="ltr">
          {fmt.date(row.updatedAt)}
        </td>
        <td className="px-4 py-3 text-end">
          <Button variant="ghost" size="sm" onClick={expand}>
            {t('admin.table.manage')}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </Button>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-border/60 bg-muted/20">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Actions + details */}
              <div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => act('grant')}
                    disabled={busy || row.paddle || row.effectivePlan === 'pro'}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t('admin.actions.grant')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => act('revoke')}
                    disabled={busy || row.paddle || row.effectivePlan !== 'pro'}
                  >
                    {t('admin.actions.revoke')}
                  </Button>
                </div>
                {row.paddle && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('admin.actions.paddleManaged')}
                  </p>
                )}
                <dl className="mt-3 space-y-1 text-xs">
                  <Field label={t('admin.detail.created')} value={fmt.date(row.createdAt)} />
                  {detail?.periodStart && (
                    <Field label={t('admin.detail.periodStart')} value={fmt.date(detail.periodStart)} />
                  )}
                  {detail?.paddleSubscriptionId && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t('admin.detail.paddleSub')}</dt>
                      <dd>
                        <a
                          dir="ltr"
                          href={`https://vendors.paddle.com/subscriptions-v2/${detail.paddleSubscriptionId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {t('admin.detail.viewInPaddle')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Event history */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('admin.detail.history')}
                </div>
                {!detail ? (
                  <Skeleton className="mt-2 h-16 w-full" />
                ) : detail.events.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('admin.detail.noEvents')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {detail.events.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          {t(`admin.event.${ev.type}`)}
                        </span>
                        <span dir="ltr" className="text-muted-foreground">
                          {fmt.dateTime(ev.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd dir="ltr">{value}</dd>
    </div>
  );
}
