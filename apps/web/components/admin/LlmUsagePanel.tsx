'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Coins, Cpu, Gauge, type LucideIcon } from 'lucide-react';
import type { AdminLlmUsage, LlmUsageBreakdown } from '@archivato/shared';
import { adminApi } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * AI spend, last 30 days: what the platform paid a model provider, split by
 * pipeline stage, model, agent, and heaviest user. Fed by `GET /admin/llm-usage`,
 * whose dollar figures are deterministic (a per-model price catalog — no billing
 * API), so they are an ESTIMATE and are labelled as one.
 *
 * Fails quietly: an admin dashboard shouldn't blank out because one panel's
 * request failed (the panel simply doesn't render).
 */
export function LlmUsagePanel() {
  const { t } = useTranslation('admin');
  const fmt = useFormat();
  const [usage, setUsage] = useState<AdminLlmUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .llmUsage()
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (!usage) return null;

  const { last30d, last7d } = usage;
  // Average over calls that actually consumed tokens — dividing by every call
  // would dilute it with mock calls and calls that died before a response.
  const avgCost =
    last30d.billedCalls > 0 ? last30d.costUsd / last30d.billedCalls : 0;

  return (
    <section className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t('llm.title')}</h2>
        <span className="text-xs text-muted-foreground">{t('llm.window')}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          icon={Coins}
          label={t('llm.spend')}
          value={fmt.usd(last30d.costUsd)}
          sub={t('llm.spend7d', { amount: fmt.usd(last7d.costUsd) })}
          accent
        />
        <Tile
          icon={Cpu}
          label={t('llm.tokens')}
          value={fmt.number(last30d.totalTokens)}
          sub={t('llm.calls', { n: fmt.number(last30d.calls) })}
        />
        <Tile
          icon={Gauge}
          label={t('llm.avgCall')}
          value={fmt.usd(avgCost)}
          sub={t('llm.billedCalls', { n: fmt.number(last30d.billedCalls) })}
        />
        <Tile
          icon={AlertTriangle}
          label={t('llm.failed')}
          value={fmt.number(last30d.failedCalls)}
          sub={t('llm.failedHint')}
        />
      </div>

      {/* Unpriced calls make `spend` a FLOOR, not a total — say so, loudly. */}
      {last30d.unpricedCalls > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('llm.unpriced', { n: fmt.number(last30d.unpricedCalls) })}</span>
        </p>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SpendList
          title={t('llm.byStage')}
          rows={usage.byStage}
          empty={t('llm.none')}
          label={(r) => t(`llm.stage.${r.key}`, { defaultValue: r.key })}
        />
        <SpendList
          title={t('llm.byModel')}
          rows={usage.byModel}
          empty={t('llm.none')}
          label={(r) => r.key}
          mono
        />
        <SpendList
          title={t('llm.byAgent')}
          rows={usage.byAgent}
          empty={t('llm.none')}
          label={(r) => r.key.replace(/_/g, ' ')}
        />
        <SpendList
          title={t('llm.topUsers')}
          rows={usage.topUsers}
          empty={t('llm.noUsers')}
          // No label ⇒ the caller lacks `admin:users:read`; show the opaque id.
          label={(r) => r.label ?? `${r.key.slice(0, 8)}…`}
          mono
        />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">{t('llm.estimate')}</p>
    </section>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
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
        <div className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/** A breakdown table: label · calls · tokens · cost, ranked by spend. */
function SpendList({
  title,
  rows,
  empty,
  label,
  mono,
}: {
  title: string;
  rows: LlmUsageBreakdown[];
  empty: string;
  label: (row: LlmUsageBreakdown) => string;
  mono?: boolean;
}) {
  const { t } = useTranslation('admin');
  const fmt = useFormat();
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">{title}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row) => {
              // Every call in the row ran on an unpriced model ⇒ we know the
              // tokens but not the money. Say "unknown", never "$0.00".
              const unknownCost = row.unpricedCalls === row.calls;
              const partial = row.unpricedCalls > 0 && !unknownCost;
              return (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span
                    className={`truncate ${mono ? 'font-mono' : ''}`}
                    title={label(row)}
                    dir={mono ? 'ltr' : undefined}
                  >
                    {label(row)}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-3 tabular-nums"
                    dir="ltr"
                  >
                    <span className="text-muted-foreground">
                      {fmt.number(row.totalTokens)}
                    </span>
                    <span
                      className="w-16 text-end font-semibold"
                      title={
                        row.unpricedCalls > 0
                          ? t('llm.unpricedRow', {
                              n: fmt.number(row.unpricedCalls),
                            })
                          : undefined
                      }
                    >
                      {unknownCost ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${fmt.usd(row.costUsd)}${partial ? '*' : ''}`
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
