'use client';

import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2, Flag } from 'lucide-react';
import type { ProjectRoadmap, RoadmapPhase } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { DownloadButton } from '@/components/shared/DownloadButton';

/** Read-only presentation of the implementation roadmap (phased timeline). */
export function RoadmapView({ roadmap }: { roadmap: ProjectRoadmap }) {
  const { t } = useTranslation('stages');
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

      {/* Vertical timeline of phases. */}
      <ol className="mt-5 space-y-5">
        {roadmap.phases.map((phase, i) => (
          <PhaseCard key={i} phase={phase} index={i + 1} />
        ))}
      </ol>
    </div>
  );
}

function PhaseCard({ phase, index }: { phase: RoadmapPhase; index: number }) {
  const { t } = useTranslation('stages');
  return (
    <li className="relative rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {index}
        </span>
        <h4 className="text-base font-semibold" dir="auto">
          {phase.name}
        </h4>
        {phase.effort && <Badge variant="primary">{phase.effort}</Badge>}
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
