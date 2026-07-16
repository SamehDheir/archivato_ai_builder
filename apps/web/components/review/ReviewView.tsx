'use client';

import { useTranslation } from 'react-i18next';
import { AlertTriangle, GitCompareArrows, UserCheck } from 'lucide-react';
import type {
  ClientReadinessFinding,
  ConsistencyFinding,
  ReviewFinding,
  ReviewReport,
  Severity,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

/**
 * The engineering dimensions rendered as sub-score tiles. `clientReadiness` is
 * deliberately NOT here: it's a separate deal-risk lens with its own section (and
 * it's optional, so it would widen these lookups to `number | undefined`).
 */
const SUB_SCORES = ['security', 'scalability', 'performance', 'cost'] as const;

export function ReviewView({ report }: { report: ReviewReport }) {
  const { t } = useTranslation('stages');
  // Defensive defaults so reports generated before this enhancement still render.
  const securityIssues = report.securityIssues ?? [];
  const scalabilityIssues = report.scalabilityIssues ?? [];
  const performanceRisks = report.performanceRisks ?? [];
  const costOptimizations = report.costOptimizations ?? [];
  const overall = report.overallScore ?? report.scalabilityScore;
  const scores = report.scores;
  // R10 — owner-only deal-risk lens. Absent on the public share payload (stripped
  // server-side) and on pre-R10 reports, so every block below guards its presence.
  const clientReadinessIssues = report.clientReadinessIssues ?? [];
  const consistencyFindings = report.consistencyFindings ?? [];
  const clientReadinessScore = scores?.clientReadiness;

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
        <Alert variant="destructive" className="mt-5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('review.critical', { count: critical.length })}</AlertTitle>
          <AlertDescription>
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
          </AlertDescription>
        </Alert>
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

      {/* R10 — client-readiness (deal-risk) axis. Owner-only; hidden on share. */}
      {(clientReadinessScore != null ||
        clientReadinessIssues.length > 0 ||
        report.clientReadinessNote) && (
        <ClientReadinessSection
          score={clientReadinessScore}
          issues={clientReadinessIssues}
          note={report.clientReadinessNote}
        />
      )}

      {/* R10 — cross-artifact consistency (automated + AI). Owner-only. */}
      {consistencyFindings.length > 0 && (
        <ConsistencySection findings={consistencyFindings} />
      )}

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

/**
 * The client-readiness (deal-risk) axis — its own score plus findings, each with
 * a manual `suggestedResolution` chip. OWNER-ONLY: this whole block is stripped
 * from the public share payload server-side, so it simply never renders there.
 */
function ClientReadinessSection({
  score,
  issues,
  note,
}: {
  score?: number;
  issues: ClientReadinessFinding[];
  note?: string;
}) {
  const { t } = useTranslation('stages');
  return (
    <Section
      title={t('review.clientReadiness.title')}
      icon={UserCheck}
      count={issues.length || undefined}
    >
      {score != null && (
        <p className="mb-2 text-sm">
          <span className="text-muted-foreground">{t('review.clientReadiness.score')} </span>
          <span className={cn('font-semibold', scoreClass(score).split(' ')[0])}>
            {score}
            <span className="text-xs font-normal text-muted-foreground">/100</span>
          </span>
        </p>
      )}
      {note && (
        <p className="mb-2 text-sm text-muted-foreground" dir="auto">
          {note}
        </p>
      )}
      {issues.length ? (
        <div className="space-y-2">
          {issues.map((f, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-3"
              dir="auto"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold uppercase',
                    SEVERITY_CLASS[f.severity],
                  )}
                >
                  {t(`review.severity.${f.severity}`, { defaultValue: f.severity })}
                </span>
                <span className="font-medium">{f.title}</span>
                <Badge variant="outline" className="ms-auto">
                  {t(`review.resolution.${f.suggestedResolution}`, {
                    defaultValue: f.suggestedResolution,
                  })}
                </Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{f.detail}</div>
              {f.resolutionHint && (
                <div className="mt-1 text-xs text-foreground/80">
                  → {f.resolutionHint}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        !note && (
          <span className="text-sm text-muted-foreground">
            {t('review.empty.clientReadiness')}
          </span>
        )
      )}
    </Section>
  );
}

/**
 * Cross-artifact consistency findings, tagged automated (deterministic code) vs
 * ai (the reviewer's judgment) so the source is visible. OWNER-ONLY.
 */
function ConsistencySection({ findings }: { findings: ConsistencyFinding[] }) {
  const { t } = useTranslation('stages');
  return (
    <Section
      title={t('review.consistency.title')}
      icon={GitCompareArrows}
      count={findings.length || undefined}
    >
      <div className="space-y-2">
        {findings.map((f, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-3"
            dir="auto"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'text-xs font-semibold uppercase',
                  SEVERITY_CLASS[f.severity],
                )}
              >
                {t(`review.severity.${f.severity}`, { defaultValue: f.severity })}
              </span>
              <span className="font-medium">{f.title}</span>
              <Badge
                variant={f.source === 'automated' ? 'muted' : 'secondary'}
                className="ms-auto"
              >
                {t(`review.source.${f.source}`, { defaultValue: f.source })}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{f.detail}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">
              {f.artifacts.join(' ↔ ')}
            </div>
          </div>
        ))}
      </div>
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
