'use client';

import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type {
  ReviewFinding,
  ReviewReport,
  ReviewScores,
  Severity,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { Empty, Section } from '@/components/design/RequirementDocumentView';

const SEVERITY_CLASS: Record<Severity, string> = {
  low: 'text-muted-foreground',
  medium: 'text-warning',
  high: 'text-[#fb923c]',
  critical: 'text-destructive',
};

/** Findings at these severities are surfaced in the Critical Issues callout. */
const CRITICAL: Severity[] = ['high', 'critical'];

function scoreClass(score: number): string {
  if (score >= 80) return 'text-success border-success';
  if (score >= 60) return 'text-warning border-warning';
  return 'text-destructive border-destructive';
}

const SUB_SCORES: (keyof ReviewScores)[] = [
  'security',
  'scalability',
  'performance',
  'cost',
];

export function ReviewView({ report }: { report: ReviewReport }) {
  const { t } = useTranslation('stages');
  // Defensive defaults so reports generated before this enhancement still render.
  const securityIssues = report.securityIssues ?? [];
  const scalabilityIssues = report.scalabilityIssues ?? [];
  const performanceRisks = report.performanceRisks ?? [];
  const costOptimizations = report.costOptimizations ?? [];
  const overall = report.overallScore ?? report.scalabilityScore;
  const scores = report.scores;

  const critical = [
    ...securityIssues,
    ...scalabilityIssues,
    ...performanceRisks,
  ].filter((f) => CRITICAL.includes(f.severity));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('review.generated', {
            date: new Date(report.generatedAt).toLocaleString(),
          })}
        </p>
        <DownloadButton
          filename={`review-${report.sessionId}.json`}
          data={report}
          label={t('review.download')}
        />
      </div>

      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4',
            scoreClass(overall),
          )}
        >
          <span className="text-2xl font-bold leading-none">{overall}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('review.overall')}
          </span>
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground" dir="auto">
            {report.summary}
          </p>
          {scores && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SUB_SCORES.map((key) => (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(`review.score.${key}`)}
                  </div>
                  <div
                    className={cn(
                      'text-lg font-semibold leading-tight',
                      scoreClass(scores[key]).split(' ')[0],
                    )}
                  >
                    {scores[key]}
                    <span className="text-xs font-normal text-muted-foreground">
                      /100
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Critical Issues — the worst findings across every dimension, up top. */}
      {critical.length > 0 && (
        <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />{' '}
            {t('review.critical', { count: critical.length })}
          </div>
          <ul className="space-y-1.5">
            {critical.map((f, i) => (
              <li key={i} className="text-sm" dir="auto">
                <span
                  className={cn(
                    'me-2 text-xs font-semibold uppercase',
                    SEVERITY_CLASS[f.severity],
                  )}
                >
                  {t(`review.severity.${f.severity}`, { defaultValue: f.severity })}
                </span>
                <span className="font-medium">{f.title}</span>
                <span className="text-muted-foreground"> — {f.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FindingSection
        title={t('review.securityIssues')}
        findings={securityIssues}
        emptyText={t('review.empty.security')}
      />
      <FindingSection
        title={t('review.scalabilityProblems')}
        findings={scalabilityIssues}
        emptyText={t('review.empty.scalability')}
      />
      <FindingSection
        title={t('review.performanceRisks')}
        findings={performanceRisks}
        emptyText={t('review.empty.performance')}
      />
      <FindingSection
        title={t('review.costOptimization')}
        findings={costOptimizations}
        emptyText={t('review.empty.cost')}
      />

      <ListSection
        title={t('review.missingRequirements')}
        items={report.missingFeatures ?? []}
        emptyText={t('review.empty.missing')}
      />
      <ListSection
        title={t('review.suggestions')}
        items={report.recommendations ?? []}
        emptyText="—"
      />
    </div>
  );
}

function FindingSection({
  title,
  findings,
  emptyText,
}: {
  title: string;
  findings: ReviewFinding[];
  emptyText: string;
}) {
  const { t } = useTranslation('stages');
  return (
    <Section title={title} count={findings.length || undefined}>
      {findings.length ? (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-3"
              dir="auto"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold uppercase',
                    SEVERITY_CLASS[f.severity],
                  )}
                >
                  {t(`review.severity.${f.severity}`, { defaultValue: f.severity })}
                </span>
                <span className="font-medium">{f.title}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{f.detail}</div>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{emptyText}</span>
      )}
    </Section>
  );
}

function ListSection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <Section title={title}>
      {items.length ? (
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {items.map((it, i) => (
            <li key={i} dir="auto">
              {it}
            </li>
          ))}
        </ul>
      ) : emptyText === '—' ? (
        <Empty />
      ) : (
        <span className="text-sm text-muted-foreground">{emptyText}</span>
      )}
    </Section>
  );
}
