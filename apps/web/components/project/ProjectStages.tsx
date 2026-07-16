'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Database as DatabaseIcon,
  Download,
  FileText,
  FlaskConical,
  Flag,
  History,
  Lock,
  MessageSquare,
  Network,
  Shapes,
  ShieldAlert,
  Sparkles,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type {
  ApiDesign,
  DatabaseDesign,
  FixResult,
  PipelineStageName,
  ProjectSnapshot,
  RefineResult,
  RequirementDocument,
  RequirementsSummary,
  ReviewReport,
  SystemDesign,
  UpstreamRevisions,
} from '@archivato/shared';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StreamingConsole } from '@/components/project/StreamingConsole';
import type { StreamView } from '@/lib/stream';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequirementDocumentView } from '@/components/design/RequirementDocumentView';
import { RequirementDocumentEditor } from '@/components/design/RequirementDocumentEditor';
import { SystemDesignView } from '@/components/design/SystemDesignView';
import { SystemDesignEditor } from '@/components/design/SystemDesignEditor';
import { DatabaseDesignView } from '@/components/design/DatabaseDesignView';
import { DatabaseDesignEditor } from '@/components/design/DatabaseDesignEditor';
import { ApiDesignView } from '@/components/design/ApiDesignView';
import { ApiDesignEditor } from '@/components/design/ApiDesignEditor';
import { ReviewView } from '@/components/review/ReviewView';
import { RoadmapPanel } from '@/components/roadmap/RoadmapPanel';
import { CostEstimatePanel } from '@/components/cost/CostEstimatePanel';
import { ThreatModelPanel } from '@/components/security/ThreatModelPanel';
import { QaPlanPanel } from '@/components/qa/QaPlanPanel';
import { StaleNotice } from '@/components/project/StaleNotice';
import { ShareLinkCard } from '@/components/project/ShareLinkCard';
import { ExportView } from '@/components/project/ExportView';
import { OpenApiView } from '@/components/design/OpenApiView';
import { ChatPanel } from '@/components/project/ChatPanel';
import { VersionHistory } from '@/components/project/VersionHistory';
import { DiagramsView } from '@/components/design/DiagramsView';
import { DesignCanvas } from '@/components/design/DesignCanvas';
import { EmptyState } from '@/components/shared/EmptyState';
import { SummaryView } from '@/components/interview/SummaryView';
import { ProductVisionPanel } from '@/components/product/ProductVisionPanel';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useUpgrade } from '@/components/billing/upgrade-dialog';

/** The in-flight streaming generation: which stage + the accumulated console view. */
export type StreamState = { stage: PipelineStageName; view: StreamView };

/** Tab order + icons (drives the tab bar). Labels come from `project.tab.*`. */
const TABS: { value: TabKey; icon: LucideIcon }[] = [
  { value: 'vision', icon: Sparkles },
  { value: 'requirements', icon: FileText },
  { value: 'system', icon: Network },
  { value: 'database', icon: DatabaseIcon },
  { value: 'api', icon: Webhook },
  { value: 'diagrams', icon: Workflow },
  { value: 'canvas', icon: Shapes },
  { value: 'review', icon: ClipboardCheck },
  { value: 'roadmap', icon: Flag },
  { value: 'cost', icon: Coins },
  { value: 'threat', icon: ShieldAlert },
  { value: 'qa', icon: FlaskConical },
  { value: 'export', icon: Download },
  { value: 'apidocs', icon: BookOpen },
  { value: 'refine', icon: MessageSquare },
  { value: 'history', icon: History },
];

export type TabKey =
  | 'vision'
  | 'requirements'
  | 'system'
  | 'database'
  | 'api'
  | 'diagrams'
  | 'canvas'
  | 'review'
  | 'roadmap'
  | 'cost'
  | 'threat'
  | 'qa'
  | 'export'
  | 'apidocs'
  | 'refine'
  | 'history';

/**
 * Tabs unlocked only on Pro — the API design and everything downstream of it.
 * For free users these show a lock badge; clicking one that isn't reachable yet
 * (needs an `apiDesign` they can't generate) opens the upgrade modal. The `api`
 * tab is the exception: it stays navigable so the free user lands on its in-tab
 * `UpgradeStage` panel.
 */
const PRO_TABS = new Set<TabKey>([
  'api',
  'review',
  'roadmap',
  'cost',
  'threat',
  'qa',
  'export',
  'apidocs',
  'refine',
]);

/**
 * The confirmed pipeline as tabs: one stage visible at a time (instead of one
 * long vertical stack). Downstream tabs are disabled until their prerequisite
 * artifact exists; each tab generates its own stage and links to the next.
 */
export function ProjectStages({
  sessionId,
  summary,
  doc,
  design,
  dbDesign,
  apiDesign,
  review,
  isPro,
  busy,
  stream,
  error,
  versionsReload,
  tab,
  onTabChange,
  dirty,
  onDirty,
  onGenerateRequirements,
  onGenerateSystem,
  onGenerateDatabase,
  onGenerateApi,
  onGenerateReview,
  onFixApplied,
  onSavedDoc,
  onSavedDesign,
  onSavedDbDesign,
  onSavedApiDesign,
  onRefined,
  onRestored,
  onUpgraded,
  weeklyRate,
  onSaveWeeklyRate,
}: {
  sessionId: string;
  summary: RequirementsSummary | null;
  doc: RequirementDocument | null;
  design: SystemDesign | null;
  dbDesign: DatabaseDesign | null;
  apiDesign: ApiDesign | null;
  review: ReviewReport | null;
  /** Whether the owner is on Pro (unlocks API design → review → roadmap → export). */
  isPro: boolean;
  busy: boolean;
  stream: StreamState | null;
  error: string | null;
  versionsReload: number;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  /** Whether the open editor/canvas currently has unsaved edits. */
  dirty: boolean;
  /** Report whether the open editor/canvas has unsaved edits (drives the guard). */
  onDirty: (dirty: boolean) => void;
  onGenerateRequirements: () => void;
  onGenerateSystem: () => void;
  onGenerateDatabase: () => void;
  onGenerateApi: () => void;
  onGenerateReview: () => void;
  /**
   * An approved review fix landed (R11). The parent takes the new report and
   * refetches the artifacts named in `artifactsTouched` — which is also exactly
   * the set whose staleness flags just moved.
   */
  onFixApplied: (result: FixResult) => void;
  onSavedDoc: (doc: RequirementDocument, opts?: { auto?: boolean }) => void;
  onSavedDesign: (design: SystemDesign, opts?: { auto?: boolean }) => void;
  onSavedDbDesign: (design: DatabaseDesign, opts?: { auto?: boolean }) => void;
  onSavedApiDesign: (design: ApiDesign, opts?: { auto?: boolean }) => void;
  onRefined: (result: RefineResult) => void;
  onRestored: (snapshot: ProjectSnapshot) => void;
  /** Called after a successful in-place upgrade so the parent can refresh the plan. */
  onUpgraded?: () => void;
  /** The owner's internal weekly rate for the cost page's suggested price. */
  weeklyRate?: number | null;
  /** Persist a new weekly rate (owner-only). */
  onSaveWeeklyRate?: (rate: number | null) => Promise<void>;
}) {
  // `tab` is controlled by the parent (so the Project Wizard can navigate to a
  // stage); `setTab` is just an alias to the parent's setter.
  const setTab = onTabChange;
  const { t } = useTranslation('project');
  const openUpgrade = useUpgrade();
  // Which stage tab is currently in edit mode (null = viewing).
  const [editing, setEditing] = useState<TabKey | null>(null);
  // Set right before an autosave updates a parent artifact, so the artifact-change
  // effect below doesn't mistake the autosave for a restore and close the editor.
  const skipEditingResetRef = useRef(false);

  /**
   * The design revision each derived artifact (review, roadmap, cost, threat, QA)
   * is measured against. A refine, an edit, or a restore moves these, and anything
   * generated from an older revision is then flagged stale where it's rendered.
   */
  const revisions: UpstreamRevisions = useMemo(
    () => ({
      requirements: doc?.generatedAt,
      systemDesign: design?.generatedAt,
      databaseDesign: dbDesign?.generatedAt,
      apiDesign: apiDesign?.generatedAt,
    }),
    [doc, design, dbDesign, apiDesign],
  );

  /**
   * Navigate to a tab, applying the freemium gate: a free user reaching for a
   * still-locked Pro stage gets the upgrade modal; a stage whose upstream isn't
   * ready yet is a no-op (rather than bouncing to a blank tab).
   */
  const goTo = (key: TabKey) => {
    if (!isPro && PRO_TABS.has(key) && !available[key]) {
      void openUpgrade({ feature: t('upgrade.unlockFeature') }).then(
        (ok) => ok && onUpgraded?.(),
      );
      return;
    }
    if (!available[key]) return;
    setTab(key);
  };

  const available: Record<TabKey, boolean> = {
    vision: true,
    requirements: true,
    system: !!doc,
    database: !!design,
    api: !!dbDesign,
    diagrams: !!design,
    canvas: !!design,
    review: !!apiDesign,
    roadmap: !!apiDesign,
    cost: !!apiDesign,
    threat: !!apiDesign,
    qa: !!apiDesign,
    export: !!apiDesign,
    apidocs: !!apiDesign,
    refine: !!apiDesign,
    history: !!doc,
  };

  // If a restore removes the artifact behind the active tab, fall back to the
  // requirements tab so the panel never goes blank. Also exit any edit mode so a
  // restored/regenerated artifact isn't being edited against stale state. A
  // debounced autosave also changes the artifact — skip the reset in that case
  // so the editor stays open.
  useEffect(() => {
    if (skipEditingResetRef.current) {
      skipEditingResetRef.current = false;
      return;
    }
    if (!available[tab]) setTab('requirements');
    setEditing(null);
    onDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, design, dbDesign, apiDesign]);

  // Leaving a stage tab exits any open editor (the leave guard already ran in
  // the parent, so a confirmed switch discards the draft).
  useEffect(() => {
    setEditing(null);
    onDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Alert variant="success" className="[&>svg]:text-success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle className="mb-0">{t('confirmed')}</AlertTitle>
        </Alert>

        {/* Sharing is free on every plan, so it sits in the header rather than in
            the (Pro) Export tab. Shown once there's a design worth reading — the
            same floor the API mints against. */}
        {dbDesign && <ShareLinkCard sessionId={sessionId} />}

        {stream && (
          <StreamingConsole stage={stream.stage} view={stream.view} />
        )}

        <Tabs value={tab} onValueChange={(v) => goTo(v as TabKey)}>
          <TabsList className="sticky top-16 z-30 flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto shadow-sm md:flex-wrap md:overflow-visible">
            {TABS.map(({ value, icon: Icon }) => {
              const locked = !isPro && PRO_TABS.has(value);
              // Locked-but-unreachable tabs stay clickable so the click can open
              // the upgrade modal (Radix disables un-clickable triggers).
              const opensModal = locked && !available[value];
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  disabled={!available[value] && !opensModal}
                  className={`shrink-0 gap-1.5${locked ? ' opacity-80' : ''}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(`tab.${value}`)}
                  {locked && (
                    <Lock
                      className="h-3 w-3 text-muted-foreground"
                      aria-label={t('pro')}
                    />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Product Vision (standalone) */}
          <TabsContent value="vision" className="mt-4">
            <ProductVisionPanel
              sessionId={sessionId}
              reloadKey={versionsReload}
            />
          </TabsContent>

          {/* Requirements */}
          <TabsContent value="requirements" className="mt-4 space-y-3">
            {!doc ? (
              <>
                <EmptyState
                  icon={FileText}
                  title={t('generate.requirementsTitle')}
                  description={t('generate.requirementsHint')}
                >
                  <Button onClick={onGenerateRequirements} disabled={busy}>
                    {busy
                      ? t('generate.generating')
                      : t('generate.requirementsBtn')}
                  </Button>
                </EmptyState>
                {summary && (
                  <div className="mt-2">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('generate.interviewPreview')}
                    </p>
                    <SummaryView summary={summary} />
                  </div>
                )}
              </>
            ) : editing === 'requirements' ? (
              <RequirementDocumentEditor
                doc={doc}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedDoc(d);
                  setEditing(null);
                }}
                onAutosaved={(d) => {
                  skipEditingResetRef.current = true;
                  onDirty(false);
                  onSavedDoc(d, { auto: true });
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <RequirementDocumentView doc={doc} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateRequirements}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('requirements');
                  }}
                  next={{ label: t('next.system'), go: () => setTab('system') }}
                />
              </>
            )}
          </TabsContent>

          {/* System design */}
          <TabsContent value="system" className="mt-4 space-y-3">
            {!design ? (
              <GenerateStage
                icon={Network}
                title={t('generate.systemTitle')}
                hint={t('generate.systemHint')}
                busy={busy}
                label={t('generate.systemBtn')}
                onGenerate={onGenerateSystem}
              />
            ) : editing === 'system' ? (
              <SystemDesignEditor
                design={design}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedDesign(d);
                  setEditing(null);
                }}
                onAutosaved={(d) => {
                  skipEditingResetRef.current = true;
                  onDirty(false);
                  onSavedDesign(d, { auto: true });
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <SystemDesignView design={design} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateSystem}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('system');
                  }}
                  next={{ label: t('next.database'), go: () => setTab('database') }}
                />
              </>
            )}
          </TabsContent>

          {/* Database design */}
          <TabsContent value="database" className="mt-4 space-y-3">
            {!dbDesign ? (
              <GenerateStage
                icon={DatabaseIcon}
                title={t('generate.databaseTitle')}
                hint={t('generate.databaseHint')}
                busy={busy}
                label={t('generate.databaseBtn')}
                onGenerate={onGenerateDatabase}
              />
            ) : editing === 'database' ? (
              <DatabaseDesignEditor
                design={dbDesign}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedDbDesign(d);
                  setEditing(null);
                }}
                onAutosaved={(d) => {
                  skipEditingResetRef.current = true;
                  onDirty(false);
                  onSavedDbDesign(d, { auto: true });
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <DatabaseDesignView design={dbDesign} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateDatabase}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('database');
                  }}
                  next={{ label: t('next.api'), go: () => setTab('api') }}
                />
              </>
            )}
          </TabsContent>

          {/* API design — the Pro wall: free stops after the database design */}
          <TabsContent value="api" className="mt-4 space-y-3">
            {!apiDesign ? (
              isPro ? (
                <GenerateStage
                  icon={Webhook}
                  title={t('generate.apiTitle')}
                  hint={t('generate.apiHint')}
                  busy={busy}
                  label={t('generate.apiBtn')}
                  onGenerate={onGenerateApi}
                />
              ) : (
                <UpgradeStage onUpgraded={onUpgraded} />
              )
            ) : editing === 'api' ? (
              <ApiDesignEditor
                design={apiDesign}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedApiDesign(d);
                  setEditing(null);
                }}
                onAutosaved={(d) => {
                  skipEditingResetRef.current = true;
                  onDirty(false);
                  onSavedApiDesign(d, { auto: true });
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <ApiDesignView design={apiDesign} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateApi}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('api');
                  }}
                  next={{ label: t('next.review'), go: () => setTab('review') }}
                />
              </>
            )}
          </TabsContent>

          {/* Architecture diagrams */}
          <TabsContent value="diagrams" className="mt-4">
            <DiagramsView sessionId={sessionId} reloadKey={versionsReload} />
          </TabsContent>

          {/* Interactive canvas (React Flow) */}
          <TabsContent value="canvas" className="mt-4">
            <DesignCanvas
              sessionId={sessionId}
              design={design}
              dbDesign={dbDesign}
              dirty={dirty}
              onDirty={onDirty}
              onSavedDesign={onSavedDesign}
              onSavedDbDesign={onSavedDbDesign}
            />
          </TabsContent>

          {/* Review */}
          <TabsContent value="review" className="mt-4 space-y-3">
            {!review ? (
              <GenerateStage
                icon={ClipboardCheck}
                title={t('generate.reviewTitle')}
                hint={t('generate.reviewHint')}
                busy={busy}
                label={t('generate.reviewBtn')}
                onGenerate={onGenerateReview}
              />
            ) : (
              <>
                <StaleNotice
                  stage="review"
                  artifact={review}
                  revisions={revisions}
                  busy={busy}
                  onRegenerate={onGenerateReview}
                />
                {/* `sessionId` is what turns on the R11 fix actions — the share
                    page and the example project render the same component without
                    it and stay read-only. */}
                <ReviewView
                  report={review}
                  sessionId={sessionId}
                  busy={busy}
                  onFixApplied={onFixApplied}
                  onRegenerate={onGenerateReview}
                />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateReview}
                  regenerateLabel={t('actions.regenerateReview')}
                  next={{ label: t('next.export'), go: () => setTab('export') }}
                />
              </>
            )}
          </TabsContent>

          {/* Roadmap (standalone, gated on the full pipeline) */}
          <TabsContent value="roadmap" className="mt-4">
            <RoadmapPanel
              sessionId={sessionId}
              reloadKey={versionsReload}
              revisions={revisions}
            />
          </TabsContent>

          {/* Cost Estimator (standalone, gated on the full pipeline) */}
          <TabsContent value="cost" className="mt-4">
            <CostEstimatePanel
              sessionId={sessionId}
              reloadKey={versionsReload}
              revisions={revisions}
              weeklyRate={weeklyRate}
              onSaveWeeklyRate={onSaveWeeklyRate}
            />
          </TabsContent>

          {/* Threat Model (standalone STRIDE analysis, gated on the full pipeline) */}
          <TabsContent value="threat" className="mt-4">
            <ThreatModelPanel
              sessionId={sessionId}
              reloadKey={versionsReload}
              revisions={revisions}
            />
          </TabsContent>

          {/* Test / QA Plan (standalone, gated on the full pipeline) */}
          <TabsContent value="qa" className="mt-4">
            <QaPlanPanel
              sessionId={sessionId}
              reloadKey={versionsReload}
              revisions={revisions}
            />
          </TabsContent>

          {/* Export */}
          <TabsContent value="export" className="mt-4">
            <ExportView sessionId={sessionId} />
          </TabsContent>

          {/* API Docs (Swagger UI) */}
          <TabsContent value="apidocs" className="mt-4">
            <OpenApiView sessionId={sessionId} reloadKey={versionsReload} />
          </TabsContent>

          {/* Refine (chat) */}
          <TabsContent value="refine" className="mt-4">
            <ChatPanel sessionId={sessionId} onRefined={onRefined} />
          </TabsContent>

          {/* Version history */}
          <TabsContent value="history" className="mt-4">
            <VersionHistory
              sessionId={sessionId}
              reloadKey={versionsReload}
              onRestored={onRestored}
            />
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * The freemium wall shown on the API tab for free users: everything up to the
 * database design is free; the API design and everything after it (review,
 * roadmap, export) require Pro. Clicking opens the in-app upgrade modal; on a
 * successful upgrade the parent refreshes the plan so the tab unlocks in place.
 */
function UpgradeStage({ onUpgraded }: { onUpgraded?: () => void }) {
  const { t } = useTranslation('project');
  const openUpgrade = useUpgrade();
  return (
    <EmptyState
      icon={Lock}
      title={t('upgrade.title')}
      description={t('upgrade.desc')}
    >
      <Button
        onClick={async () => {
          const upgraded = await openUpgrade({ feature: t('upgrade.feature') });
          if (upgraded) onUpgraded?.();
        }}
      >
        <Sparkles className="h-4 w-4" />
        {t('upgrade.cta')}
      </Button>
    </EmptyState>
  );
}

function GenerateStage({
  icon,
  title,
  hint,
  label,
  busy,
  onGenerate,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  label: string;
  busy: boolean;
  onGenerate: () => void;
}) {
  const { t } = useTranslation('project');
  return (
    <EmptyState icon={icon} title={title} description={hint}>
      <Button onClick={onGenerate} disabled={busy}>
        {busy ? t('working') : label}
      </Button>
    </EmptyState>
  );
}

function StageActions({
  busy,
  onRegenerate,
  onEdit,
  regenerateLabel,
  next,
}: {
  busy: boolean;
  onRegenerate: () => void;
  onEdit?: () => void;
  regenerateLabel?: string;
  next?: { label: string; go: () => void };
}) {
  const { t } = useTranslation('project');
  const confirm = useConfirm();

  // Regenerate replaces the current (possibly hand-edited) artifact, so confirm.
  async function confirmRegenerate() {
    const ok = await confirm({
      title: t('actions.confirmTitle'),
      description: t('actions.confirmBody'),
      confirmLabel: t('actions.confirmYes'),
      cancelLabel: t('actions.confirmNo'),
      destructive: true,
    });
    if (ok) onRegenerate();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {onEdit && (
        <Button variant="secondary" onClick={onEdit} disabled={busy}>
          {t('actions.edit')}
        </Button>
      )}
      <Button variant="secondary" onClick={confirmRegenerate} disabled={busy}>
        {regenerateLabel ?? t('actions.regenerate')}
      </Button>
      {next && (
        <Button onClick={next.go} disabled={busy}>
          {t('actions.next', { label: next.label })}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </Button>
      )}
    </div>
  );
}
