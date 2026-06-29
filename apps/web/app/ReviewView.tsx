import type { ReviewFinding, ReviewReport, Severity } from '@archivato/shared';
import { cn } from '@/lib/utils';
import { DownloadButton } from './DownloadButton';
import { Empty, Section } from './RequirementDocumentView';

const SEVERITY_CLASS: Record<Severity, string> = {
  low: 'text-muted-foreground',
  medium: 'text-warning',
  high: 'text-[#fb923c]',
  critical: 'text-destructive',
};

function scoreClass(score: number): string {
  if (score >= 80) return 'text-success border-success';
  if (score >= 60) return 'text-warning border-warning';
  return 'text-destructive border-destructive';
}

export function ReviewView({ report }: { report: ReviewReport }) {
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
            scoreClass(report.scalabilityScore),
          )}
        >
          <span className="text-2xl font-bold leading-none">
            {report.scalabilityScore}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            scalability
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{report.summary}</p>
      </div>

      <FindingSection
        title="Security issues"
        findings={report.securityIssues}
        emptyText="No security issues flagged."
      />
      <FindingSection
        title="Performance risks"
        findings={report.performanceRisks}
        emptyText="No performance risks flagged."
      />

      <ListSection
        title="Missing features"
        items={report.missingFeatures}
        emptyText="Nothing obvious missing."
      />
      <ListSection title="Recommendations" items={report.recommendations} emptyText="—" />
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
    <Section title={title}>
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
