'use client';

import { useTranslation } from 'react-i18next';
import { ShieldCheck, ListChecks } from 'lucide-react';
import {
  STRIDE_CATEGORIES,
  type Severity,
  type Threat,
  type ThreatModel,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { Section } from '@/components/design/RequirementDocumentView';

const SEVERITY_CLASS: Record<Severity, string> = {
  low: 'text-muted-foreground border-border',
  medium: 'text-warning border-warning/40',
  high: 'text-[#fb923c] border-[#fb923c]/40',
  critical: 'text-destructive border-destructive/40',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export function ThreatModelView({ model }: { model: ThreatModel }) {
  const { t } = useTranslation('stages');
  const threats = model.threats ?? [];

  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: threats.filter((x) => x.severity === sev).length,
  })).filter((c) => c.n > 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('threat.generated_at', {
            date: new Date(model.generatedAt).toLocaleString(),
          })}
        </p>
        <DownloadButton
          filename={`threat-model-${model.sessionId}.json`}
          data={model}
          label={t('threat.download')}
        />
      </div>

      <p className="text-sm text-muted-foreground" dir="auto">
        {model.summary}
      </p>

      {/* Severity tally */}
      <div className="mt-3 flex flex-wrap gap-2">
        {counts.map(({ sev, n }) => (
          <span
            key={sev}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium',
              SEVERITY_CLASS[sev],
            )}
          >
            {n} {t(`threat.severity.${sev}`, { defaultValue: sev })}
          </span>
        ))}
      </div>

      {/* Threats grouped by STRIDE category, in canonical order */}
      {STRIDE_CATEGORIES.map(({ category, title, property }) => {
        const items = sortBySeverity(
          threats.filter((x) => x.category === category),
        );
        if (!items.length) return null;
        return (
          <Section
            key={category}
            title={`${title} · ${t(`threat.property.${category}`, { defaultValue: property })}`}
            count={items.length}
          >
            <div className="space-y-2">
              {items.map((th, i) => (
                <ThreatCard key={i} threat={th} />
              ))}
            </div>
          </Section>
        );
      })}

      <Section title={t('threat.trustBoundaries')} icon={ShieldCheck} tone="blue">
        <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
          {(model.trustBoundaries ?? []).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('threat.assumptions')} icon={ListChecks} tone="violet">
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground" dir="auto">
          {(model.assumptions ?? []).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ThreatCard({ threat }: { threat: Threat }) {
  const { t } = useTranslation('stages');
  return (
    <div className="rounded-lg border border-border bg-card p-3" dir="auto">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            SEVERITY_CLASS[threat.severity],
          )}
        >
          {t(`threat.severity.${threat.severity}`, {
            defaultValue: threat.severity,
          })}
        </span>
        <span className="text-sm font-medium">{threat.component}</span>
      </div>
      <p className="mt-1.5 text-sm">{threat.threat}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {t('threat.mitigation')}:{' '}
        </span>
        {threat.mitigation}
      </p>
    </div>
  );
}

function sortBySeverity(threats: Threat[]): Threat[] {
  const rank: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...threats].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
