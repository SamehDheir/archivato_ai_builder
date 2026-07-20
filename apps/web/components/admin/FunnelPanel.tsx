'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Info, Target } from 'lucide-react';
import type { AdminFunnel, FunnelStepResult } from '@archivato/shared';
import { adminApi } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The activation funnel: signup → interview → artifact → client link → export,
 * with the one metric this business runs on ("sent a client link within 7 days
 * of signup") pulled out as the headline.
 *
 * Fails quietly, like `LlmUsagePanel`: one panel's request failing must not
 * blank out the dashboard.
 */
export function FunnelPanel() {
  const { t } = useTranslation('admin');
  const fmt = useFormat();
  const [funnel, setFunnel] = useState<AdminFunnel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .funnel()
      .then((f) => {
        if (!cancelled) setFunnel(f);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton className="mt-4 h-64 w-full rounded-lg" />;
  if (!funnel) return null;

  const { activation, steps } = funnel;
  // An event-only step is undercounted before `measurableFrom` — it has no state
  // to reconstruct it from. Saying so beats presenting the gap as a drop-off.
  const hasEventOnly = steps.some((s) => !s.retroactive);

  return (
    <section className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t('funnel.title')}</h2>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              {t('funnel.activation', { days: activation.windowDays })}
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums" dir="ltr">
              {activation.percent}%
            </div>
          </div>
          <p className="min-w-0 text-xs text-muted-foreground">
            {t('funnel.activationDetail', {
              activated: fmt.number(activation.activated),
              cohort: fmt.number(activation.cohort),
              days: activation.windowDays,
            })}
            <br />
            {/* The cohort rule is the whole reason the number means anything. */}
            <span className="text-[11px]">{t('funnel.cohortNote')}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardContent className="space-y-2 p-4">
          {steps.map((step, i) => (
            <StepRow key={step.step} step={step} isFirst={i === 0} />
          ))}
        </CardContent>
      </Card>

      {hasEventOnly && (
        <p className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {funnel.measurableFrom
              ? t('funnel.measurableFrom', { date: fmt.date(funnel.measurableFrom) })
              : t('funnel.noEvents')}
          </span>
        </p>
      )}
    </section>
  );
}

/** One step: a proportional bar, the count, and its conversion off the step above. */
function StepRow({
  step,
  isFirst,
}: {
  step: FunnelStepResult;
  isFirst: boolean;
}) {
  const { t } = useTranslation('admin');
  const fmt = useFormat();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span className="min-w-0 font-medium">
          {t(`funnel.step.${step.step}`)}
          {!step.retroactive && (
            <span className="ms-1.5 text-[10px] text-muted-foreground">
              {t('funnel.eventOnly')}
            </span>
          )}
        </span>
        <span className="tabular-nums text-muted-foreground" dir="ltr">
          {fmt.number(step.users)}
          {!isFirst && ` · ${step.percentOfPrevious}%`}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${step.percentOfCohort}%` }}
        />
      </div>
    </div>
  );
}
