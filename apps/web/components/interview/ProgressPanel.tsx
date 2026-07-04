'use client';

import { useTranslation } from 'react-i18next';
import type { InterviewState } from '@archivato/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

/** The interview's live completeness + status/phase bar. */
export function ProgressPanel({ state }: { state: InterviewState }) {
  const { t } = useTranslation('interview');
  const pct = Math.round(state.completeness * 100);
  const status = t(`status.${state.status}`, {
    defaultValue: state.status.replace(/_/g, ' '),
  });
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1.5 flex justify-between text-sm">
          <span>{t('progress.completeness')}</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{t('progress.status', { status })}</span>
          {state.phase && (
            <span>
              {t('progress.phase', {
                phase: t(`phase.${state.phase}`, {
                  defaultValue: state.phase.replace(/_/g, ' '),
                }),
              })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
