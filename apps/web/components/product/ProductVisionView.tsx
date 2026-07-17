'use client';

import { useTranslation } from 'react-i18next';
import {
  Compass,
  Gauge,
  ListChecks,
  Rocket,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import type { ProductVision } from '@archivato/shared';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { useFormat } from '@/lib/i18n/format';
import { Section } from '@/components/design/RequirementDocumentView';

/** Read-only presentation of the Product Vision (Product Manager stage). */
export function ProductVisionView({ vision }: { vision: ProductVision }) {
  const { t } = useTranslation('stages');
  const fmt = useFormat();
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> {t('vision.title')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('vision.generated', { date: fmt.dateTime(vision.generatedAt) })}
          </p>
        </div>
        <DownloadButton
          filename={`product-vision-${vision.sessionId}.json`}
          data={vision}
          label={t('vision.download')}
        />
      </div>

      {/* North-star vision */}
      <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <Compass className="h-3.5 w-3.5" /> {t('vision.northStar')}
        </div>
        <p className="text-sm leading-relaxed" dir="auto">
          {vision.vision}
        </p>
      </div>

      <Section title={t('vision.goals')} icon={Target} count={vision.goals.length}>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {vision.goals.map((g, i) => (
            <li key={i} dir="auto">
              {g}
            </li>
          ))}
        </ul>
      </Section>

      {/* MVP vs. roadmap side by side */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-success/40 bg-success/5 p-3">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-success">
            <Rocket className="h-4 w-4" /> {t('vision.mvp')}
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-normal">
              {vision.mvp.length}
            </span>
          </h4>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {vision.mvp.map((m, i) => (
              <li key={i} dir="auto">
                {m}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-muted-foreground" />{' '}
            {t('vision.futureRoadmap')}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {vision.futureFeatures.length}
            </span>
          </h4>
          {vision.futureFeatures.length ? (
            <ul className="list-disc space-y-1 ps-5 text-sm">
              {vision.futureFeatures.map((f, i) => (
                <li key={i} dir="auto">
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </div>

      <Section
        title={t('vision.successMetrics')}
        icon={Gauge}
        count={vision.successMetrics.length}
      >
        <div className="space-y-2">
          {vision.successMetrics.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium" dir="auto">
                  {m.name}
                </span>
                <span className="text-sm text-primary" dir="auto">
                  {m.target}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                {m.rationale}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('vision.personas')} icon={Users} count={vision.personas.length}>
        <div className="grid gap-3 sm:grid-cols-2">
          {vision.personas.map((p, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <p className="font-semibold" dir="auto">
                {p.name}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground" dir="auto">
                {p.description}
              </p>
              {p.goals.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('vision.goals')}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
                    {p.goals.map((g, j) => (
                      <li key={j} dir="auto">
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.painPoints.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('vision.painPoints')}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
                    {p.painPoints.map((pp, j) => (
                      <li key={j} dir="auto">
                        {pp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
