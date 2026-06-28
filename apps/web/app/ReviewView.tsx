import type { ReviewFinding, ReviewReport, Severity } from '@archivato/shared';
import { DownloadButton } from './DownloadButton';

const SEVERITY_COLORS: Record<Severity, string> = {
  low: '#9aa3b2',
  medium: '#fbbf24',
  high: '#fb923c',
  critical: '#f87171',
};

function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#fbbf24';
  return '#f87171';
}

export function ReviewView({ report }: { report: ReviewReport }) {
  return (
    <div>
      <div className="view-header">
        <p className="subtitle">
          Generated {new Date(report.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`review-${report.sessionId}.json`}
          data={report}
          label="Download review"
        />
      </div>

      <div className="score-row">
        <div
          className="score-ring"
          style={{ borderColor: scoreColor(report.scalabilityScore) }}
        >
          <span
            className="score-num"
            style={{ color: scoreColor(report.scalabilityScore) }}
          >
            {report.scalabilityScore}
          </span>
          <span className="score-label">scalability</span>
        </div>
        <p className="subtitle review-summary">{report.summary}</p>
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
      <ListSection
        title="Recommendations"
        items={report.recommendations}
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
    <div className="summary-section">
      <h4>{title}</h4>
      {findings.length ? (
        <div className="finding-list">
          {findings.map((f, i) => (
            <div className="finding" key={i}>
              <div className="finding-head">
                <span
                  className="pill"
                  style={{ color: SEVERITY_COLORS[f.severity] }}
                >
                  {f.severity}
                </span>
                <strong>{f.title}</strong>
              </div>
              <div className="subtitle">{f.detail}</div>
            </div>
          ))}
        </div>
      ) : (
        <span className="subtitle">{emptyText}</span>
      )}
    </div>
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
    <div className="summary-section">
      <h4>{title}</h4>
      {items.length ? (
        <ul className="clean">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <span className="subtitle">{emptyText}</span>
      )}
    </div>
  );
}
