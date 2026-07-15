'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Boxes,
  Clock,
  Coins,
  Database,
  HardDrive,
  Lock,
  Server,
  Sparkles,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import {
  computeSuggestedPrice,
  type CostAtScale,
  type CostCategory,
  type CostEstimate,
  type CostHostingModel,
  type EffortEstimate,
  type ProviderEstimate,
  type ServiceCostLine,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { useFormat } from '@/lib/i18n/format';

const CATEGORY_ICON: Record<CostCategory, LucideIcon> = {
  compute: Server,
  database: Database,
  bandwidth: Wifi,
  storage: HardDrive,
  platform: Boxes,
};

/**
 * Read-only presentation of the deterministic cost estimate. On the authenticated
 * cost page the owner passes `weeklyRate` + `onSaveWeeklyRate` to unlock the
 * owner-only suggested price + rate input; the public share page passes neither
 * (and its payload never carries the budget warning — stripped server-side).
 */
export function CostView({
  estimate,
  weeklyRate,
  onSaveWeeklyRate,
}: {
  estimate: CostEstimate;
  /** The owner's internal weekly rate (owner page only). */
  weeklyRate?: number | null;
  /** Present only in owner mode — enables the rate input + suggested price. */
  onSaveWeeklyRate?: (rate: number | null) => Promise<void>;
}) {
  const { t } = useTranslation('stages');
  const fmt = useFormat();
  const money = (n: number) => `$${fmt.number(n)}`;

  const [scaleIdx, setScaleIdx] = useState(1); // default to the 1,000-user view
  const { scales, providers, cheapestByScale, recommended, workload } = estimate;
  const owner = !!onSaveWeeklyRate;

  const recommendedProvider = providers.find((p) => p.provider === recommended);
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
          data={ownerExport(estimate, owner ? weeklyRate ?? null : null)}
          label={t('cost.download')}
        />
      </div>

      {/* Effort estimate (new, first). */}
      {estimate.effort && (
        <EffortSection effort={estimate.effort} money={money} />
      )}

      {/* Suggested price + rate input — OWNER ONLY. */}
      {owner && estimate.effort && (
        <SuggestedPrice
          effort={estimate.effort}
          weeklyRate={weeklyRate ?? null}
          onSave={onSaveWeeklyRate}
          money={money}
        />
      )}

      {/* Budget reality check — OWNER ONLY (stripped from the share payload). */}
      {estimate.budgetWarning && (
        <BudgetWarningCard warning={estimate.budgetWarning} money={money} />
      )}

      {/* Infrastructure estimate (existing). */}
      <h4 className="mb-2 mt-6 text-sm font-semibold">{t('cost.infra.title')}</h4>
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

      {/* Service subscriptions (new lines). */}
      {estimate.serviceSubscriptions && estimate.serviceSubscriptions.length > 0 && (
        <ServiceSubscriptions lines={estimate.serviceSubscriptions} money={money} />
      )}

      <p className="mt-5 text-xs text-muted-foreground" dir="auto">
        {estimate.disclaimer}
      </p>
    </div>
  );
}

function EffortSection({
  effort,
  money,
}: {
  effort: EffortEstimate;
  money: (n: number) => string;
}) {
  const { t } = useTranslation('stages');
  const fmt = useFormat();
  const wk = (n: number) => fmt.number(n);
  return (
    <div className="mb-5 rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-primary" /> {t('cost.effort.title')}
        </h4>
        <span className="text-base font-bold tabular-nums" dir="ltr">
          {t('cost.effort.range', { min: wk(effort.weeksMin), max: wk(effort.weeksMax) })}
        </span>
      </div>
      <ul className="space-y-1">
        {effort.lineItems.map((li, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-foreground" dir="auto">
                {li.label}
              </span>
              <span className="truncate">· {li.basis}</span>
            </span>
            <span className="shrink-0 tabular-nums" dir="ltr">
              {t('cost.effort.weeks', { min: wk(li.weeksMin), max: wk(li.weeksMax) })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t('cost.effort.note')}
      </p>
    </div>
  );
}

function SuggestedPrice({
  effort,
  weeklyRate,
  onSave,
  money,
}: {
  effort: EffortEstimate;
  weeklyRate: number | null;
  onSave: (rate: number | null) => Promise<void>;
  money: (n: number) => string;
}) {
  const { t } = useTranslation('stages');
  const [value, setValue] = useState(weeklyRate != null ? String(weeklyRate) : '');
  const [saving, setSaving] = useState(false);

  // Re-sync when the saved rate changes (e.g. switching to another project), so
  // the input never shows a previous project's rate next to this one's price.
  useEffect(() => {
    setValue(weeklyRate != null ? String(weeklyRate) : '');
  }, [weeklyRate]);

  async function save() {
    setSaving(true);
    try {
      const trimmed = value.trim();
      const rate = trimmed === '' ? null : Number(trimmed);
      await onSave(rate != null && Number.isFinite(rate) && rate >= 0 ? rate : null);
    } finally {
      setSaving(false);
    }
  }

  const price =
    weeklyRate != null && weeklyRate > 0
      ? computeSuggestedPrice(effort, weeklyRate)
      : null;

  return (
    <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        <Lock className="h-3.5 w-3.5" /> {t('cost.price.internal')}
      </div>
      {price && (
        <div className="text-lg font-bold tabular-nums" dir="ltr">
          {money(price.min)} – {money(price.max)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          {t('cost.price.rateLabel')}
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            dir="ltr"
            className="mt-1 h-8 w-32"
            value={value}
            placeholder={t('cost.price.ratePlaceholder')}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={save} disabled={saving}>
          {saving ? t('cost.price.saving') : t('cost.price.save')}
        </Button>
      </div>
    </div>
  );
}

function BudgetWarningCard({
  warning,
  money,
}: {
  warning: NonNullable<CostEstimate['budgetWarning']>;
  money: (n: number) => string;
}) {
  const { t } = useTranslation('stages');
  const critical = warning.severity === 'critical';
  return (
    <div
      className={cn(
        'mb-5 rounded-lg border p-4',
        critical
          ? 'border-destructive/40 bg-destructive/[0.06]'
          : 'border-amber-500/40 bg-amber-500/[0.06]',
      )}
    >
      <div
        className={cn(
          'mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide',
          critical ? 'text-destructive' : 'text-amber-700 dark:text-amber-300',
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {t(`cost.budget.severity.${warning.severity}`)}
      </div>
      <p className="text-sm" dir="auto">
        {t(warning.messageKey, {
          overPct: warning.values.overPct,
          estimatedLowUsd: money(warning.values.estimatedLowUsd),
          budgetMaxUsd: money(warning.values.budgetMaxUsd),
        })}
      </p>
      {(warning.links.mvpPhase || warning.links.outOfScope) && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {warning.links.mvpPhase && <li>• {t('cost.budget.mvpHint')}</li>}
          {warning.links.outOfScope && <li>• {t('cost.budget.outOfScopeHint')}</li>}
        </ul>
      )}
    </div>
  );
}

function ServiceSubscriptions({
  lines,
  money,
}: {
  lines: ServiceCostLine[];
  money: (n: number) => string;
}) {
  const { t } = useTranslation('stages');
  return (
    <div className="mt-6">
      <h4 className="mb-1 text-sm font-semibold">{t('cost.services.title')}</h4>
      <p className="mb-2 text-xs text-muted-foreground">{t('cost.services.subtitle')}</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lines.map((line) => (
          <li key={line.capability} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium" dir="auto">
                {t(`system.buildVsBuy.cap.${line.capability}`, {
                  defaultValue: line.label,
                })}
              </div>
              {line.suggestedService && (
                <div className="text-xs text-muted-foreground" dir="auto">
                  {line.suggestedService}
                </div>
              )}
              {line.feeNote && (
                <div className="mt-0.5 text-xs italic text-muted-foreground" dir="auto">
                  {line.feeNote}
                </div>
              )}
            </div>
            <div className="shrink-0 text-end text-sm tabular-nums">
              {line.monthlyUsd != null ? (
                <>
                  {money(line.monthlyUsd)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('cost.perMonth')}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t(`cost.services.${line.basis === 'unknown' ? 'unknown' : 'usageBased'}`)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The JSON export body. In owner mode the owner-only pricing (weekly rate +
 * computed suggested price) is added under a clearly namespaced `internal` key;
 * a share/non-owner download carries only the client-safe estimate.
 */
function ownerExport(estimate: CostEstimate, weeklyRate: number | null) {
  if (weeklyRate == null || weeklyRate <= 0 || !estimate.effort) return estimate;
  return {
    ...estimate,
    internal: {
      weeklyRate,
      suggestedPrice: computeSuggestedPrice(estimate.effort, weeklyRate),
      note: 'Internal — not shown to your client.',
    },
  };
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
