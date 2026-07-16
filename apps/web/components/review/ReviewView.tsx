'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  GitCompareArrows,
  History,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wand2,
} from 'lucide-react';
import {
  type ClientReadinessFinding,
  type ConsistencyFinding,
  type FixProposal,
  type FixResult,
  type ReviewFinding,
  type ReviewReport,
  type Severity,
} from '@archivato/shared';
import { reviewApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { Empty, Section } from '@/components/design/RequirementDocumentView';
import { FindingActions, StatusChip, type FindingHandlers } from './FindingActions';
import { FixPreviewModal } from './FixPreviewModal';

const SEVERITY_CLASS: Record<Severity, string> = {
  low: 'text-muted-foreground',
  medium: 'text-warning',
  high: 'text-[#fb923c]',
  critical: 'text-destructive',
};

/** Findings at these severities are surfaced in the Critical Issues callout. */
const CRITICAL: Severity[] = ['high', 'critical'];

/**
 * How many findings one batch may draft a fix for. Mirrors `MAX_BATCH` in the
 * API's `ProposeFixDto` — the server is the boundary, but letting the owner tick a
 * sixth box only to be handed a class-validator error is a worse way to learn the
 * limit than not being able to tick it.
 */
const MAX_BATCH = 5;

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

/**
 * The review report.
 *
 * **Interactivity is gated on `sessionId`.** Without it this stays what it always
 * was — a pure function of its artifact — which is what lets the public share page
 * and the read-only example project render it unchanged. The R11 fix actions call
 * owner-scoped APIs, so offering them on a page with no session would be a button
 * that can only fail. The share payload also has the whole workflow layer stripped
 * server-side (`redactReviewForShare`), so this is the second of two independent
 * reasons those controls can't appear there — the server's is the one that counts.
 */
export function ReviewView({
  report,
  sessionId,
  busy = false,
  onFixApplied,
  onRegenerate,
}: {
  report: ReviewReport;
  /** Owner's session id. Absent ⇒ read-only (share page / example project). */
  sessionId?: string;
  busy?: boolean;
  /** Fires after an approved fix lands, so the parent can refetch what changed. */
  onFixApplied?: (result: FixResult) => void;
  /** Re-run the review against the patched artifacts. */
  onRegenerate?: () => void;
}) {
  const { t } = useTranslation('stages');
  const interactive = !!sessionId && !!onFixApplied;

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

  const fix = useFixFlow({ report, sessionId, onFixApplied, onRegenerate });

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

      {fix.delta && <ScoreDelta from={fix.delta.from} to={fix.delta.to} />}
      {interactive && fix.applied > 0 && !fix.delta && (
        <RerunPrompt count={fix.applied} busy={busy} onRerun={fix.rerun} />
      )}
      {fix.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{fix.error}</AlertDescription>
        </Alert>
      )}
      {interactive && fix.selected.size > 0 && (
        <BatchBar
          count={fix.selected.size}
          busy={fix.busy}
          onPropose={fix.proposeSelected}
          onClear={fix.clearSelection}
        />
      )}

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
        fix={fix}
        interactive={interactive}
      />
      <FindingSection
        title={t('review.scalabilityProblems')}
        findings={scalabilityIssues}
        emptyText={t('review.empty.scalability')}
        fix={fix}
        interactive={interactive}
      />
      <FindingSection
        title={t('review.performanceRisks')}
        findings={performanceRisks}
        emptyText={t('review.empty.performance')}
        fix={fix}
        interactive={interactive}
      />
      <FindingSection
        title={t('review.costOptimization')}
        findings={costOptimizations}
        emptyText={t('review.empty.cost')}
        fix={fix}
        interactive={interactive}
      />

      {/* R10 — client-readiness (deal-risk) axis. Owner-only; hidden on share. */}
      {(clientReadinessScore != null ||
        clientReadinessIssues.length > 0 ||
        report.clientReadinessNote) && (
        <ClientReadinessSection
          score={clientReadinessScore}
          issues={clientReadinessIssues}
          note={report.clientReadinessNote}
          fix={fix}
          interactive={interactive}
        />
      )}

      {/* R10 — cross-artifact consistency (automated + AI). Owner-only. */}
      {consistencyFindings.length > 0 && (
        <ConsistencySection
          findings={consistencyFindings}
          fix={fix}
          interactive={interactive}
        />
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

      {interactive && fix.log.length > 0 && <FixLog entries={fix.log} />}

      {fix.proposal && (
        <FixPreviewModal
          proposal={fix.proposal}
          busy={fix.busy}
          error={fix.error}
          onApply={fix.apply}
          onClose={fix.discard}
        />
      )}
    </div>
  );
}

// ── the fix flow ────────────────────────────────────────────────────────────

type FixFlow = ReturnType<typeof useFixFlow>;

/**
 * All R11 client state in one place: selection, the drafted proposal, the log, and
 * the score delta.
 *
 * The ordering rule that matters: `proposal` is only ever set by `propose` (which
 * writes nothing) and is only ever consumed by `apply` (which the owner triggers
 * from the modal). There is no path from a draft to a write that doesn't pass
 * through the modal's Apply button.
 */
function useFixFlow({
  report,
  sessionId,
  onFixApplied,
  onRegenerate,
}: {
  report: ReviewReport;
  sessionId?: string;
  onFixApplied?: (result: FixResult) => void;
  onRegenerate?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [proposal, setProposal] = useState<FixProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<FixResult['fixLog']>([]);
  const [applied, setApplied] = useState(0);
  const [delta, setDelta] = useState<{ from: number; to: number } | null>(null);

  // Load the existing log. It lives on the SESSION precisely so it outlives the
  // report — a re-run replaces the review and a restore can rewind it — so it has
  // to be fetched, not just accumulated from actions taken on this page. Without
  // this an owner returning tomorrow sees no history at all.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    reviewApi
      .fixLog(sessionId)
      .then((entries) => {
        if (!cancelled) setLog(entries);
      })
      // Best-effort: the log is a record of past work, not part of this render.
      // Failing to load it must not break the report the owner came here for.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const overall = report.overallScore ?? report.scalabilityScore;
  // The score captured at the moment Re-run was pressed. A ref, not state, so the
  // effect below can read it without re-running when it changes.
  const rerunFrom = useRef<number | null>(null);
  const generatedAt = useRef(report.generatedAt);

  // A new report arrived. If it came from a Re-run we triggered, that's the delta.
  useEffect(() => {
    if (report.generatedAt === generatedAt.current) return;
    generatedAt.current = report.generatedAt;
    if (rerunFrom.current == null) return;
    setDelta({ from: rerunFrom.current, to: overall });
    rerunFrom.current = null;
    setApplied(0);
    setSelected(new Set());
  }, [report.generatedAt, overall]);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const run = useCallback(
    // `resolved` is how many findings the action dealt with — a batch apply
    // resolves several at once, so counting actions would under-report it and the
    // re-run prompt would say "you applied 1 fix" after fixing three.
    //
    // Returns whether it landed, because the caller has to know: closing the
    // preview on a failure would throw away a draft the owner would have to pay
    // for again.
    async (fn: () => Promise<FixResult>, resolved = 1): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
        setLog(result.fixLog);
        setApplied((n) => n + resolved);
        setDelta(null);
        onFixApplied?.(result);
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onFixApplied, fail],
  );

  const propose = useCallback(
    async (ids: string[]) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        setProposal(await reviewApi.proposeFix(sessionId, ids));
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, fail],
  );

  const apply = useCallback(async () => {
    if (!sessionId || !proposal) return;
    const ok = await run(
      () => reviewApi.applyFix(sessionId, proposal),
      proposal.findingIds.length,
    );
    // Keep the preview open on failure. The draft cost a model call, and the error
    // is about *this* patch — discarding it would make the owner pay to see the
    // same thing again, with the message hidden behind a modal that just closed.
    if (!ok) return;
    setProposal(null);
    setSelected(new Set());
  }, [sessionId, proposal, run]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // Deselecting is always allowed; only adding past the cap is refused, so the
      // owner can never get stuck with a selection they can't act on.
      else if (next.size < MAX_BATCH) next.add(id);
      return next;
    });
  }, []);

  const handlers: FindingHandlers = {
    onPropose: (id) => propose([id]),
    onAddClientQuestion: (id, question) =>
      sessionId && run(() => reviewApi.addClientQuestion(sessionId, id, question)),
    onAddOutOfScope: (id, item) =>
      sessionId && run(() => reviewApi.addOutOfScope(sessionId, id, item)),
    onAdvisory: (id, action, note) =>
      sessionId && run(() => reviewApi.resolveAdvisory(sessionId, id, action, note)),
  };

  return {
    selected,
    toggle,
    atBatchLimit: selected.size >= MAX_BATCH,
    clearSelection: () => setSelected(new Set()),
    proposeSelected: () => propose([...selected]),
    proposal,
    discard: () => setProposal(null),
    apply,
    busy,
    error,
    log,
    applied,
    delta,
    handlers,
    rerun: () => {
      rerunFrom.current = overall;
      setError(null);
      onRegenerate?.();
    },
  };
}

function ScoreDelta({ from, to }: { from: number; to: number }) {
  const { t } = useTranslation('stages');
  const improved = to >= from;
  const Icon = improved ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        'mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm',
        improved
          ? 'border-success/40 bg-success/5 text-success'
          : 'border-warning/40 bg-warning/5 text-warning',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium" dir="ltr">
        {from} → {to}
      </span>
      <span className="text-muted-foreground">
        {t(improved ? 'review.fix.delta.up' : 'review.fix.delta.down')}
      </span>
    </div>
  );
}

/**
 * Shown only once a fix has actually been applied. A generic "regenerate" already
 * exists below the report; this is the contextual one — it knows fixes landed, so
 * it can capture the current score and show the owner what they bought.
 */
function RerunPrompt({
  count,
  busy,
  onRerun,
}: {
  count: number;
  busy: boolean;
  onRerun: () => void;
}) {
  const { t } = useTranslation('stages');
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm" dir="auto">
        {t('review.fix.rerun.hint', { count })}
      </p>
      <Button size="sm" onClick={onRerun} disabled={busy} className="gap-1.5">
        <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
        {t('review.fix.rerun.button')}
      </Button>
    </div>
  );
}

function BatchBar({
  count,
  busy,
  onPropose,
  onClear,
}: {
  count: number;
  busy: boolean;
  onPropose: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation('stages');
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium">
        {t('review.fix.batch.selected', { count })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          {t('review.fix.batch.clear')}
        </Button>
        <Button size="sm" onClick={onPropose} disabled={busy} className="gap-1.5">
          <Wand2 className="h-3.5 w-3.5" />
          {t('review.fix.batch.propose')}
        </Button>
      </div>
    </div>
  );
}

function FixLog({ entries }: { entries: FixResult['fixLog'] }) {
  const { t } = useTranslation('stages');
  return (
    <Section title={t('review.fix.log.title')} icon={History} count={entries.length}>
      <ul className="space-y-1.5">
        {entries.map((entry, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Badge variant="muted" className="font-normal">
              {t(`review.fix.action.${entry.action}`, { defaultValue: entry.action })}
            </Badge>
            <span dir="auto">{entry.findingTitle}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(entry.at).toLocaleString()}
            </span>
            {entry.note && (
              <span className="text-xs text-muted-foreground" dir="auto">
                — {entry.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── finding cards ───────────────────────────────────────────────────────────

/**
 * One finding: the severity + title line every report has always had, plus (when
 * interactive) its status chip, its batch checkbox, and its action row.
 */
function FindingCard({
  finding,
  fix,
  interactive,
  children,
}: {
  finding: ReviewFinding;
  fix: FixFlow;
  interactive: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('stages');
  const status = finding.status ?? 'open';
  // Only a patch can be batched — a conversion needs its own text, and an advisory
  // has nothing to draft.
  const batchable =
    interactive && finding.actionType === 'patch' && status === 'open' && !!finding.id;

  return (
    <div className="rounded-lg border border-border bg-card p-3" dir="auto">
      <div className="flex flex-wrap items-center gap-2">
        {batchable && (
          <input
            type="checkbox"
            checked={fix.selected.has(finding.id!)}
            onChange={() => fix.toggle(finding.id!)}
            disabled={fix.atBatchLimit && !fix.selected.has(finding.id!)}
            className="h-3.5 w-3.5 shrink-0 accent-primary disabled:opacity-40"
            title={
              fix.atBatchLimit && !fix.selected.has(finding.id!)
                ? t('review.fix.batch.limit', { max: MAX_BATCH })
                : undefined
            }
            aria-label={t('review.fix.batch.select', { title: finding.title })}
          />
        )}
        <span
          className={cn(
            'text-xs font-semibold uppercase',
            SEVERITY_CLASS[finding.severity],
          )}
        >
          {t(`review.severity.${finding.severity}`, { defaultValue: finding.severity })}
        </span>
        <span className="font-medium">{finding.title}</span>
        {children}
        {interactive && (
          <span className="ms-auto">
            <StatusChip status={status} />
          </span>
        )}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{finding.detail}</div>
      {interactive && (
        <FindingActions finding={finding} busy={fix.busy} handlers={fix.handlers} />
      )}
    </div>
  );
}

function FindingSection({
  title,
  findings,
  emptyText,
  fix,
  interactive,
}: {
  title: string;
  findings: ReviewFinding[];
  emptyText: string;
  fix: FixFlow;
  interactive: boolean;
}) {
  return (
    <Section title={title} count={findings.length || undefined}>
      {findings.length ? (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <FindingCard
              key={f.id ?? i}
              finding={f}
              fix={fix}
              interactive={interactive}
            />
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
  fix,
  interactive,
}: {
  score?: number;
  issues: ClientReadinessFinding[];
  note?: string;
  fix: FixFlow;
  interactive: boolean;
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
            <FindingCard
              key={f.id ?? i}
              finding={f}
              fix={fix}
              interactive={interactive}
            >
              <Badge variant="outline">
                {t(`review.resolution.${f.suggestedResolution}`, {
                  defaultValue: f.suggestedResolution,
                })}
              </Badge>
            </FindingCard>
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
function ConsistencySection({
  findings,
  fix,
  interactive,
}: {
  findings: ConsistencyFinding[];
  fix: FixFlow;
  interactive: boolean;
}) {
  const { t } = useTranslation('stages');
  return (
    <Section
      title={t('review.consistency.title')}
      icon={GitCompareArrows}
      count={findings.length || undefined}
    >
      <div className="space-y-2">
        {findings.map((f, i) => (
          <FindingCard key={f.id ?? i} finding={f} fix={fix} interactive={interactive}>
            <Badge variant={f.source === 'automated' ? 'muted' : 'secondary'}>
              {t(`review.source.${f.source}`, { defaultValue: f.source })}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {f.artifacts.join(' ↔ ')}
            </span>
          </FindingCard>
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
