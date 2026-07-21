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
  Mic,
  Network,
  PenLine,
  Shapes,
  ShieldAlert,
  Compass,

  Sparkles,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { DirectionProvider } from '@radix-ui/react-direction';
import {
  artifactTextDirection,
  buildEffortEstimate,
  computeSuggestedPrice,
  detectArtifactLanguage,
} from '@archivato/shared';
import type {
  ApiDesign,
  ArtifactLanguage,
  DatabaseDesign,
  InterviewExchange,
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
import { cn } from '@/lib/utils';
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
import { GenerationNotice } from '@/components/project/GenerationNotice';
import { ShareLinkCard } from '@/components/project/ShareLinkCard';
import { ExportView } from '@/components/project/ExportView';
import { ProposalModal } from '@/components/project/ProposalModal';
import { OpenApiView } from '@/components/design/OpenApiView';
import { ChatPanel } from '@/components/project/ChatPanel';
import { VersionHistory } from '@/components/project/VersionHistory';
import { DiagramsView } from '@/components/design/DiagramsView';
import { DesignCanvas } from '@/components/design/DesignCanvas';
import { EmptyState } from '@/components/shared/EmptyState';
import { SummaryView } from '@/components/interview/SummaryView';
import { InterviewTranscript } from '@/components/interview/InterviewTranscript';
import { ProductVisionPanel } from '@/components/product/ProductVisionPanel';
import { BusinessAnalysisPanel } from '@/components/product/BusinessAnalysisPanel';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useUpgrade } from '@/components/billing/upgrade-dialog';
import { useFormat } from '@/lib/i18n/format';

/** The in-flight streaming generation: which stage + the accumulated console view. */
export type StreamState = { stage: PipelineStageName; view: StreamView };

/**
 * Whether the stage rail is currently drawn vertically (the `md` breakpoint).
 *
 * Radix Tabs takes `orientation` as a prop and uses it to decide which arrow
 * keys move the selection — so the value has to track the CSS breakpoint, which
 * only CSS knows about.
 *
 * Starts `false` (mobile-first) so SSR and the first client render agree; the
 * effect then corrects it. `useEffect`, not `useLayoutEffect`, is deliberate:
 * this value drives NO layout — the rail's axis is pure CSS (`md:flex-col`) —
 * so the one-frame window before it syncs can only mean arrow keys briefly move
 * on the wrong axis. There is never a visual jump to block paint for, and
 * `useLayoutEffect` would warn during SSR for nothing.
 */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return desktop;
}

/**
 * Tab order + icons (drives the tab bar). Labels come from `project.tab.*`.
 *
 * **Ordered by the DEAL, not by the build (R12).** The pipeline generates
 * requirements → system → database → API, and the nav used to mirror that — which
 * is the order the *machine* works in, not the order the owner sells in. What a
 * dev shop reaches for after a client call is the scope, the price, and the
 * timeline; the architecture is how they defend those. So the client-facing
 * artifacts lead and the technical ones follow.
 *
 * This is presentational only. Cost and Roadmap still need the full pipeline, so
 * they sit here disabled until the API design exists — a locked tab early in the
 * list is the honest read (it says "this is coming, and it's what matters"),
 * where burying them behind eight technical tabs said the opposite.
 */
const TABS: { value: TabKey; icon: LucideIcon }[] = [
  // The source: the client's own words, which everything below is derived from.
  // First because it is what an owner reaches for when a client disputes what
  // was agreed — and because it is the one tab that is never generated, never
  // gated, and never stale. It does not compete with the deal ordering below;
  // it precedes it.
  { value: 'interview', icon: Mic },
  // The deal: what the client reads and decides on.
  { value: 'business', icon: Compass },
  { value: 'vision', icon: Sparkles },
  { value: 'requirements', icon: FileText },
  { value: 'cost', icon: Coins },
  { value: 'roadmap', icon: Flag },
  // The build: how the team delivers it.
  { value: 'system', icon: Network },
  { value: 'database', icon: DatabaseIcon },
  { value: 'api', icon: Webhook },
  { value: 'apidocs', icon: BookOpen },
  { value: 'diagrams', icon: Workflow },
  { value: 'canvas', icon: Shapes },
  // Assurance, then handoff.
  { value: 'review', icon: ClipboardCheck },
  { value: 'threat', icon: ShieldAlert },
  { value: 'qa', icon: FlaskConical },
  { value: 'export', icon: Download },
  { value: 'refine', icon: MessageSquare },
  { value: 'history', icon: History },
];

/**
 * The stages a project can switch off (R12). Hidden from the nav — not disabled —
 * when `generateExtendedArtifacts` is false: a disabled tab reads as "you can't
 * afford this yet" and invites a click that does nothing, whereas this project
 * simply isn't producing them. The quiet action below the tabs brings them back.
 */
const EXTENDED_TABS = new Set<TabKey>(['threat', 'qa']);

/**
 * Which artifact each stage waits on, for the locked tooltip ("Requires the
 * database design"). This is the SAME gate `available` computes — it just names
 * the blocker instead of only refusing.
 *
 * A dimmed nav item with no explanation makes the user guess whether the stage
 * is broken, unpaid for, or merely not reached yet; those need three different
 * reactions. The Pro lock is a separate axis (`PRO_TABS`) and reads its own
 * badge, because "not yet" and "not on your plan" are different problems.
 */
const REQUIRES: Partial<Record<TabKey, TabKey>> = {
  system: 'requirements',
  database: 'system',
  diagrams: 'system',
  canvas: 'system',
  api: 'database',
  review: 'api',
  roadmap: 'api',
  cost: 'api',
  threat: 'api',
  qa: 'api',
  export: 'api',
  apidocs: 'api',
  refine: 'api',
  history: 'requirements',
};

export type TabKey =
  | 'interview'
  | 'business'
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
  history,
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
  clientName,
  weeklyRate,
  onSaveWeeklyRate,
  extendedArtifacts = true,
  onEnableExtendedArtifacts,
  autoGenerateBusiness = false,
  onBusinessAutoGenerated,
  artifactLanguage,
}: {
  sessionId: string;
  summary: RequirementsSummary | null;
  /**
   * The discovery transcript, for the Interview tab.
   *
   * Passed in rather than fetched: the dashboard already holds the whole
   * `InterviewState` (it drives the pre-confirm flow and the wizard), so a fetch
   * here would be a second read of something already in memory.
   */
  history: InterviewExchange[];
  doc: RequirementDocument | null;
  design: SystemDesign | null;
  dbDesign: DatabaseDesign | null;
  apiDesign: ApiDesign | null;
  review: ReviewReport | null;
  /** Whether the owner is on Pro (unlocks API design → review → roadmap → export). */
  isPro: boolean;
  /**
   * The language this project's artifacts are written in — the direction the
   * artifact column is laid out in. Absent on a legacy payload, in which case it
   * is inferred from the artifacts themselves (see `documentLanguage`).
   */
  artifactLanguage?: ArtifactLanguage;
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
  /** The end client this scoping is for (R5) — prefills the proposal message. */
  clientName?: string | null;
  /** The owner's internal weekly rate for the cost page's suggested price. */
  weeklyRate?: number | null;
  /** Persist a new weekly rate (owner-only). */
  onSaveWeeklyRate?: (rate: number | null) => Promise<void>;
  /**
   * Whether this project produces the threat model + QA plan (R12). Defaults true
   * so an older cached payload without the field behaves exactly as before.
   */
  extendedArtifacts?: boolean;
  /** Switch them on for a project that opted out at the gate. */
  onEnableExtendedArtifacts?: () => void;
  /** Generate the business analysis on first view (set right after confirmation). */
  autoGenerateBusiness?: boolean;
  /** Fired when the auto-generation kicks off, so the parent drops the one-shot flag. */
  onBusinessAutoGenerated?: () => void;
}) {
  // `tab` is controlled by the parent (so the Project Wizard can navigate to a
  // stage); `setTab` is just an alias to the parent's setter.
  const setTab = onTabChange;
  const { t } = useTranslation('project');
  const openUpgrade = useUpgrade();
  const { usd } = useFormat();

  /**
   * The direction to lay the artifact column out in.
   *
   * Prefer what the server says the project generates in. Fall back to **reading
   * the artifacts themselves**, which is not belt-and-braces — it is the only
   * signal that exists for the two states this has to survive:
   *
   *   - a project generated before any of this existed, whose documents came
   *     back Arabic because the model mirrored an Arabic interview, and which
   *     carries no stamp anywhere;
   *   - a running API that predates the `artifactLanguage` field, so the payload
   *     simply omits it.
   *
   * In both, the session says nothing and the prose is plainly Arabic. Sampling
   * the requirement document's own summary answers it — the same
   * `detectArtifactLanguage` used to pick the default in the first place, applied
   * to the text actually on screen.
   */
  const documentLanguage =
    artifactLanguage ??
    detectArtifactLanguage(
      [doc?.executiveSummary, doc?.functional?.[0]?.title, summary?.goal]
        .filter(Boolean)
        .join(' '),
    );
  // Which stage tab is currently in edit mode (null = viewing).
  const [editing, setEditing] = useState<TabKey | null>(null);
  // R13 — the proposal message composer (owner-only; opens over the project).
  const [writingProposal, setWritingProposal] = useState(false);

  /**
   * The owner's internal suggested price, formatted exactly as the Cost tab shows
   * it, to prefill the proposal message. Null without a weekly rate — we never
   * invent a figure, and the message simply carries no price.
   *
   * Derived here rather than read from the stored cost estimate for the same
   * reason the roadmap does it: `buildEffortEstimate` is deterministic from the
   * design, so it can't hand the owner a stale number to quote a client.
   */
  const suggestedPrice = useMemo(() => {
    if (!design || !weeklyRate) return null;
    const price = computeSuggestedPrice(buildEffortEstimate(design), weeklyRate);
    return `${usd(price.min)} – ${usd(price.max)}`;
  }, [design, weeklyRate, usd]);
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

  // The rail is vertical from `md` up (a CSS decision), and Radix needs the same
  // axis in JS to point its arrow keys the right way.
  const desktop = useIsDesktop();

  /**
   * Which stages this component can honestly report as done.
   *
   * Only the five design artifacts are here because they're the only ones
   * ProjectStages holds. The standalone stages (vision, roadmap, cost, threat,
   * QA) are fetched by their own panels — Radix unmounts inactive `TabsContent`,
   * so lifting those fetches up just to draw a checkmark would make every
   * project open fire five extra requests. An absent check reads as "not sure
   * yet", which is true; a wrong one would read as "not generated", which isn't.
   */
  const stageDone: Partial<Record<TabKey, boolean>> = useMemo(
    () => ({
      requirements: !!doc,
      system: !!design,
      database: !!dbDesign,
      api: !!apiDesign,
      review: !!review,
    }),
    [doc, design, dbDesign, apiDesign, review],
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

  // R12 — a project that opted out of the extended artifacts doesn't show them.
  const visibleTabs = useMemo(
    () =>
      TABS.filter(
        ({ value }) => extendedArtifacts || !EXTENDED_TABS.has(value),
      ),
    [extendedArtifacts],
  );

  const available: Record<TabKey, boolean> = {
    // Always: the transcript is what created the project, so it exists before
    // any artifact does and no restore can rewind it away.
    interview: true,
    business: true,
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
    // R12 — "switched off" has to mean unreachable, not just unlisted: the command
    // palette navigates by key too, and a tab with no trigger would render its
    // panel with nothing selected in the bar.
    threat: !!apiDesign && extendedArtifacts,
    qa: !!apiDesign && extendedArtifacts,
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
    // `extendedArtifacts` is in here because it feeds `available` (R12): if the
    // threat/QA tabs are ever switched off while one of them is active, its trigger
    // vanishes from the bar and the panel would be left rendered with nothing
    // selected. No path does that today — the quiet action only switches them ON —
    // but leaving the dep out makes that a silent trap for whoever adds one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, design, dbDesign, apiDesign, extendedArtifacts]);

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

        {/*
          R13 — the step that was still manual. Everything above turns a client
          call into a scoping; this turns the scoping into a submitted bid. It
          sits beside the link because that is the pair the owner sends: a message
          is what carries the link, and a link with no message is half a bid.

          Gated on `apiDesign` — the same full-pipeline floor the API enforces. A
          message whose credibility rests on "I scoped this properly" should not
          be offered while the scoping is half-built.
        */}
        {apiDesign && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setWritingProposal(true)}>
              <PenLine className="h-4 w-4" />
              {t('proposal.write')}
            </Button>
            <p className="text-xs text-muted-foreground" dir="auto">
              {t('proposal.writeHint')}
            </p>
          </div>
        )}

        {stream && (
          <StreamingConsole stage={stream.stage} view={stream.view} />
        )}

        {/* `orientation` drives Radix's roving arrow-key navigation, so it has to
            match the axis the rail is actually drawn on. The rail is vertical
            from `md` up, which CSS knows and JS doesn't — hence the media query
            listener in `useIsDesktop`. */}
        <Tabs
          value={tab}
          onValueChange={(v) => goTo(v as TabKey)}
          orientation={desktop ? 'vertical' : 'horizontal'}
          className="md:flex md:items-start md:gap-5"
        >
          <StageNav
            tabs={visibleTabs}
            active={tab}
            available={available}
            done={stageDone}
            isPro={isPro}
          />

          {/*
            `min-w-0` is load-bearing: without it this flex child refuses to
            shrink below its content's intrinsic width, and a wide artifact
            table pushes the whole page into a horizontal scroll instead of
            scrolling inside its own container.

            `dir`/`lang` come from the **document**, not the UI locale. The two
            are independent here in a way they are nowhere else in the app: an
            owner reading the console in English may be scoping a project whose
            package is written in Arabic, and vice versa. Setting it on the
            artifact column rather than the page keeps the surrounding chrome —
            tabs, buttons, the nav — in the owner's own direction, which is what
            they navigate by.

            The `DirectionProvider` is what makes that `dir` hold. Radix resolves
            direction from CONTEXT, not from the DOM, so a Radix control rendered
            in here (the structured editors' Selects) would take the app-wide
            viewer direction and stamp a contradicting `dir` attribute inside a
            column that declares the opposite — the same mismatch that made the
            whole page render LTR before the app-wide provider existed. Wherever
            we set an explicit `dir` on a subtree, Radix's context has to agree.
          */}
          <DirectionProvider dir={artifactTextDirection(documentLanguage)}>
          <div
            dir={artifactTextDirection(documentLanguage)}
            lang={documentLanguage}
            className="min-w-0 flex-1"
          >

          {/*
            R12 — the way back for a project that opted out. Deliberately quiet: a
            muted one-liner under the tabs, not a banner. The owner already decided
            this deal doesn't need a STRIDE analysis; nagging them about it on every
            visit would be exactly the heaviness the setting exists to remove.
            Switching it on only reveals the tabs — each stage still generates on
            demand, so nothing else re-runs.
          */}
          {!extendedArtifacts && onEnableExtendedArtifacts && apiDesign && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onEnableExtendedArtifacts}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                {t('extended.enable')}
              </button>
            </div>
          )}

          {/*
            The discovery conversation. Read-only and always present: it is the
            record of what the client actually said, and every artifact below is
            derived from it — so when a generated document says something
            surprising, this is where the owner checks whether the client said it
            or the model inferred it.

            It is not an artifact: nothing generates it, nothing gates it, a
            version restore cannot rewind it, and there is no Generate button and
            no empty state to design around. It also deliberately has no
            share-page counterpart — the transcript is the client's own unedited
            words about their business, and the public payload has never carried
            it.
          */}
          <TabsContent value="interview" className="mt-4">
            <Card>
              <CardContent className="p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold">
                    {t('interview.title')}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('interview.hint')}
                  </p>
                </div>
                <InterviewTranscript history={history} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Product Vision (standalone) */}
          <TabsContent value="business" className="mt-4">
            <BusinessAnalysisPanel
              sessionId={sessionId}
              reloadKey={versionsReload}
              autoGenerate={autoGenerateBusiness}
              onAutoGenerated={onBusinessAutoGenerated}
            />
          </TabsContent>

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
                <GenerationNotice
                  generation={doc.generation}
                  busy={busy}
                  onRegenerate={onGenerateRequirements}
                />
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
                <GenerationNotice
                  generation={design.generation}
                  busy={busy}
                  onRegenerate={onGenerateSystem}
                />
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
                <GenerationNotice
                  generation={dbDesign.generation}
                  busy={busy}
                  onRegenerate={onGenerateDatabase}
                />
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
                <GenerationNotice
                  generation={apiDesign.generation}
                  busy={busy}
                  onRegenerate={onGenerateApi}
                />
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
                <GenerationNotice
                  generation={review.generation}
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
            <ExportView
              sessionId={sessionId}
              clientName={clientName}
              suggestedPrice={suggestedPrice}
            />
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
          </div>
          </DirectionProvider>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>

      {writingProposal && (
        <ProposalModal
          sessionId={sessionId}
          clientName={clientName}
          suggestedPrice={suggestedPrice}
          onClose={() => setWritingProposal(false)}
        />
      )}
    </Card>
  );
}

/**
 * The persistent stage nav: a side rail on desktop, a scrolling segmented strip
 * on mobile.
 *
 * Still a Radix `TabsList` underneath, and that is deliberate rather than
 * incidental. Radix **unmounts inactive `TabsContent`**, which the whole file
 * depends on (every stage panel fetches on mount, and the staleness notices
 * assume a fresh read). Rebuilding this as a bespoke nav + a conditional render
 * would have quietly changed that, so the rail is a restyle of the existing
 * primitive: `orientation="vertical"` also hands us roving up/down arrow-key
 * navigation for free, which a hand-rolled list would have had to reimplement.
 *
 * Each item carries its state explicitly, because "why can't I click this?" has
 * three different answers and they need three different affordances:
 *   done    — a check; the artifact exists
 *   current — the accent bar
 *   locked  — dimmed + a tooltip naming the missing prerequisite
 *   pro     — a lock badge; a plan problem, not a progress one
 */
function StageNav({
  tabs,
  active,
  available,
  done,
  isPro,
}: {
  tabs: { value: TabKey; icon: LucideIcon }[];
  active: TabKey;
  available: Record<TabKey, boolean>;
  /**
   * Stages whose artifact this component can actually see. Deliberately partial:
   * the standalone stages (vision, roadmap, cost, threat, QA) are fetched by
   * their own panels, so ProjectStages genuinely does not know whether they
   * exist. Showing an unknown state as "not done" would be a confident lie, so
   * those items simply carry no check.
   */
  done: Partial<Record<TabKey, boolean>>;
  isPro: boolean;
}) {
  const { t } = useTranslation('project');

  return (
    <TabsList
      className={cn(
        'h-auto w-full justify-start gap-1 p-1',
        // Mobile: a horizontal strip that scrolls under the sticky header.
        'sticky top-16 z-30 flex flex-nowrap overflow-x-auto shadow-sm scrollbar-thin',
        // Desktop: a real side rail that stays put while the artifact scrolls.
        'md:top-20 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:shadow-none',
      )}
    >
      {tabs.map(({ value, icon: Icon }) => {
        const locked = !isPro && PRO_TABS.has(value);
        // Locked-but-unreachable tabs stay clickable so the click can open the
        // upgrade modal (Radix disables un-clickable triggers).
        const opensModal = locked && !available[value];
        const blocked = !available[value] && !opensModal;
        const requires = REQUIRES[value];

        return (
          <TabsTrigger
            key={value}
            value={value}
            disabled={blocked}
            title={
              blocked && requires
                ? t('nav.requires', { stage: t(`tab.${requires}`) })
                : undefined
            }
            className={cn(
              'shrink-0 justify-start gap-2 md:w-full',
              locked && 'opacity-80',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t(`tab.${value}`)}</span>
            <span className="ms-auto flex items-center gap-1">
              {done[value] && (
                <CheckCircle2
                  className={cn(
                    'h-3 w-3',
                    // On the active (accent-filled) trigger the check has to sit
                    // on the accent, not on the page.
                    value === active ? 'text-primary-foreground' : 'text-success',
                  )}
                  aria-label={t('nav.done')}
                />
              )}
              {locked && (
                <Lock className="h-3 w-3 opacity-70" aria-label={t('pro')} />
              )}
            </span>
          </TabsTrigger>
        );
      })}
    </TabsList>
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
