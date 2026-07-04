'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  Coins,
  Database,
  HardDrive,
  Server,
  Sparkles,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type {
  CostAtScale,
  CostCategory,
  CostEstimate,
  CostHostingModel,
  ProviderEstimate,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { useFormat } from '@/lib/i18n/format';

const CATEGORY_ICON: Record<CostCategory, LucideIcon> = {
  compute: Server,
  database: Database,
  bandwidth: Wifi,
  storage: HardDrive,
  platform: Boxes,
};

/** Read-only presentation of the deterministic multi-provider cost estimate. */
export function CostView({ estimate }: { estimate: CostEstimate }) {
  const { t } = useTranslation('stages');
  const fmt = useFormat();
  const money = (n: number) => `$${fmt.number(n)}`;

  const [scaleIdx, setScaleIdx] = useState(1); // default to the 1,000-user view
  const { scales, providers, cheapestByScale, recommended, workload } = estimate;

  const recommendedProvider = providers.find((p) => p.provider === recommended);

  // Providers sorted cheapest-first for the selected scale's breakdown.
  const sorted = [...providers].sort(
    (a, b) => a.costs[scaleIdx].monthlyUsd - b.costs[scaleIdx].monthlyUsd,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Coins className="h-5 w-5 text-primary" /> {t('cost.title')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('cost.generated', { date: fmt.dateTime(estimate.generatedAt) })}
          </p>
        </div>
        <DownloadButton
          filename={`cost-estimate-${estimate.sessionId}.json`}
          data={estimate}
          label={t('cost.download')}
        />
      </div>

      {/* Workload the estimate was derived from. */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <WorkloadChip label={t('cost.workload.services')} value={workload.services} />
        <WorkloadChip label={t('cost.workload.entities')} value={workload.entities} />
        <WorkloadChip label={t('cost.workload.endpoints')} value={workload.endpoints} />
        <WorkloadChip
          label={t('cost.workload.database')}
          value={workload.databaseType}
        />
        <WorkloadChip
          label={t('cost.workload.architecture')}
          value={t(`system.arch.${workload.architecture}`, {
            defaultValue: workload.architecture,
          })}
        />
      </div>

      {/* Recommended provider. */}
      {recommendedProvider && (
        <div className="mb-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {t('cost.bestValue')}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base font-semibold">
              {recommendedProvider.name}
            </span>
            <ModelBadge model={recommendedProvider.model} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground" dir="auto">
            {recommendedProvider.bestFor}
          </p>
        </div>
      )}

      {/* Comparison matrix: provider × scale. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-start">
              <th className="px-3 py-2 text-start font-semibold">
                {t('cost.col.provider')}
              </th>
              {scales.map((s) => (
                <th key={s} className="px-3 py-2 text-end font-semibold">
                  {t('cost.usersLabel', { n: fmt.number(s) })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr
                key={p.provider}
                className={cn(
                  'border-b border-border/60 last:border-0',
                  p.provider === recommended && 'bg-primary/[0.04]',
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <ModelBadge model={p.model} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground" dir="auto">
                    {p.summary}
                  </div>
                </td>
                {p.costs.map((c, i) => {
                  const cheapest = cheapestByScale[String(scales[i])] === p.provider;
                  return (
                    <td key={i} className="px-3 py-2.5 text-end align-top">
                      <span
                        className={cn(
                          'inline-flex flex-col items-end tabular-nums',
                          cheapest && 'font-semibold text-success',
                        )}
                      >
                        <span>
                          {money(c.monthlyUsd)}
                          <span className="text-xs font-normal text-muted-foreground">
                            {t('cost.perMonth')}
                          </span>
                        </span>
                        {cheapest && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-success">
                            {t('cost.cheapest')}
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-provider breakdown at a chosen scale. */}
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{t('cost.breakdown')}</h4>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {scales.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setScaleIdx(i)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  i === scaleIdx
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('cost.usersLabel', { n: fmt.number(s) })}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((p) => (
            <ProviderCard
              key={p.provider}
              provider={p}
              cost={p.costs[scaleIdx]}
              cheapest={cheapestByScale[String(scales[scaleIdx])] === p.provider}
              money={money}
            />
          ))}
        </div>
      </div>

      <p className="mt-5 text-xs text-muted-foreground" dir="auto">
        {estimate.disclaimer}
      </p>
    </div>
  );
}

function WorkloadChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold" dir="auto">
        {value}
      </span>
    </span>
  );
}

function ModelBadge({ model }: { model: CostHostingModel }) {
  const { t } = useTranslation('stages');
  return (
    <Badge variant="secondary" className="text-[10px] uppercase">
      {t(`cost.model.${model}`, { defaultValue: model })}
    </Badge>
  );
}

function ProviderCard({
  provider,
  cost,
  cheapest,
  money,
}: {
  provider: ProviderEstimate;
  cost: CostAtScale;
  cheapest: boolean;
  money: (n: number) => string;
}) {
  const { t } = useTranslation('stages');
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3',
        cheapest ? 'border-success/50' : 'border-border',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{provider.name}</span>
        <span className="text-lg font-bold tabular-nums">
          {money(cost.monthlyUsd)}
          <span className="text-xs font-normal text-muted-foreground">
            {t('cost.perMonth')}
          </span>
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {cost.lineItems.map((li, i) => {
          const Icon = CATEGORY_ICON[li.category];
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate" dir="auto">
                  {li.label}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{money(li.monthlyUsd)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
