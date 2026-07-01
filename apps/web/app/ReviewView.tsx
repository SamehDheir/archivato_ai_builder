import { AlertTriangle } from 'lucide-react';
import type {
  ReviewFinding,
  ReviewReport,
  ReviewScores,
  Severity,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { DownloadButton } from './DownloadButton';
import { Empty, Section } from './RequirementDocumentView';

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

const SUB_SCORES: { key: keyof ReviewScores; label: string }[] = [
  { key: 'security', label: 'Security' },
  { key: 'scalability', label: 'Scalability' },
  { key: 'performance', label: 'Performance' },
  { key: 'cost', label: 'Cost' },
];

export function ReviewView({ report }: { report: ReviewReport }) {
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
          Generated {new Date(report.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`review-${report.sessionId}.json`}
          data={report}
          label="Download review"
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
            overall
          </span>
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{report.summary}</p>
          {scores && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SUB_SCORES.map(({ key, label }) => (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {label}
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
            <AlertTriangle className="h-4 w-4" /> Critical issues ({critical.length})
          </div>
          <ul className="space-y-1.5">
            {critical.map((f, i) => (
              <li key={i} className="text-sm">
                <span
                  className={cn(
                    'mr-2 text-xs font-semibold uppercase',
                    SEVERITY_CLASS[f.severity],
                  )}
                >
                  {f.severity}
                </span>
                <span className="font-medium">{f.title}</span>
                <span className="text-muted-foreground"> — {f.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FindingSection
        title="Security issues"
        findings={securityIssues}
        emptyText="No security issues flagged."
      />
      <FindingSection
        title="Scalability problems"
        findings={scalabilityIssues}
        emptyText="No scalability problems flagged."
      />
      <FindingSection
        title="Performance risks"
        findings={performanceRisks}
        emptyText="No performance risks flagged."
      />
      <FindingSection
        title="Cost optimization"
        findings={costOptimizations}
        emptyText="No cost optimizations suggested."
      />

      <ListSection
        title="Missing requirements"
        items={report.missingFeatures ?? []}
        emptyText="Nothing obvious missing."
      />
      <ListSection
        title="Suggestions"
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
  return (
    <Section title={title} count={findings.length || undefined}>
      {findings.length ? (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold uppercase',
                    SEVERITY_CLASS[f.severity],
                  )}
                >
                  {f.severity}
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
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
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
