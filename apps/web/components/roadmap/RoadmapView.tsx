'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2, Flag, Rocket } from 'lucide-react';
import type { ProjectRoadmap, RoadmapPhase } from '@archivato/shared';
import { cn } from '@/lib/utils';
import { useFormat } from '@/lib/i18n/format';
import { Badge } from '@/components/ui/badge';
import { DownloadButton } from '@/components/shared/DownloadButton';

/** Read-only presentation of the implementation roadmap (phased timeline). */
export function RoadmapView({ roadmap }: { roadmap: ProjectRoadmap }) {
  const { t } = useTranslation('stages');
  const alt = roadmap.alternativeRoadmaps;
  // On a timeline conflict the roadmap ships two plans; default to the one that
  // fits the client's deadline (the reduced scope they actually asked about).
  const [plan, setPlan] = useState<'withinDeadline' | 'fullScope'>(
    'withinDeadline',
  );
  const phases = alt
    ? plan === 'withinDeadline'
      ? alt.withinDeadline
      : alt.fullScope
    : roadmap.phases;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Flag className="h-5 w-5 text-primary" /> {t('roadmap.title')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground" dir="auto">
            {roadmap.summary}
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{t('roadmap.totalEstimate')}</span>
            <span className="text-muted-foreground" dir="auto">
              {roadmap.totalEstimate}
            </span>
          </div>
        </div>
        <DownloadButton
          filename={`roadmap-${roadmap.sessionId}.json`}
          data={roadmap}
          label={t('roadmap.download')}
        />
      </div>

      {alt && (
        <DualRoadmapToggle plan={plan} onChange={setPlan} excluded={alt.excludedFromDeadline} />
      )}

      {/* Vertical timeline of phases. */}
      <ol className="mt-5 space-y-5">
        {phases.map((phase, i) => (
          <PhaseCard key={`${plan}-${i}`} phase={phase} index={i + 1} />
        ))}
      </ol>
    </div>
  );
}

/** The within-deadline / full-scope switch shown only on a timeline conflict. */
function DualRoadmapToggle({
  plan,
  onChange,
  excluded,
}: {
  plan: 'withinDeadline' | 'fullScope';
  onChange: (p: 'withinDeadline' | 'fullScope') => void;
  excluded: string[];
}) {
  const { t } = useTranslation('stages');
  return (
    <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <p className="text-sm font-medium">{t('roadmap.dual.title')}</p>
      <p className="mt-0.5 text-xs text-muted-foreground" dir="auto">
        {t('roadmap.dual.lead')}
      </p>
      <div className="mt-2 inline-flex rounded-md border border-border bg-card p-0.5">
        {(['withinDeadline', 'fullScope'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={plan === key}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              plan === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`roadmap.dual.${key}`)}
          </button>
        ))}
      </div>
      {plan === 'withinDeadline' && excluded.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t('roadmap.dual.excluded')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
            {excluded.map((item, i) => (
              <li key={i} dir="auto">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PhaseCard({ phase, index }: { phase: RoadmapPhase; index: number }) {
  const { t } = useTranslation('stages');
  const fmt = useFormat();
  // Prefer the effort-grounded week range (computed in code) over the legacy
  // free-text effort string; fall back to the string for pre-R10 roadmaps.
  const range =
    phase.weeksMin != null && phase.weeksMax != null
      ? t('roadmap.weeks', {
          min: fmt.number(phase.weeksMin),
          max: fmt.number(phase.weeksMax),
        })
      : phase.effort || null;

  return (
    <li className="relative rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {index}
        </span>
        <h4 className="text-base font-semibold" dir="auto">
          {phase.name}
        </h4>
        {phase.isMvp && (
          <Badge variant="default" className="gap-1">
            <Rocket className="h-3 w-3" />
            {t('roadmap.mvp')}
          </Badge>
        )}
        {range && <Badge variant="primary">{range}</Badge>}
        {phase.dependsOn.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('roadmap.after', { deps: phase.dependsOn.join(', ') })}
          </span>
        )}
      </div>
      {phase.goal && (
        <p className="mt-1 ps-8 text-sm text-muted-foreground" dir="auto">
          {phase.goal}
        </p>
      )}
      {phase.isMvp && phase.mvpStatement && (
        <p className="mt-2 ps-8 text-sm font-medium text-success" dir="auto">
          {phase.mvpStatement}
        </p>
      )}

      <div className="mt-3 space-y-3 ps-8">
        {phase.milestones.map((m, j) => (
          <div key={j} className="rounded-md border border-border/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium" dir="auto">
                {m.title}
              </span>
              {m.effort && (
                <span className="text-xs text-muted-foreground">{m.effort}</span>
              )}
            </div>
            <ul className="mt-2 space-y-1">
              {m.tasks.map((task, k) => (
                <li key={k} className="flex gap-2 text-sm" dir="auto">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    {task.title}
                    {task.detail && (
                      <span className="text-muted-foreground"> — {task.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </li>
  );
}
