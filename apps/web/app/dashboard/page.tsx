'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, LayoutGrid, Plus, Search, Settings } from 'lucide-react';
import type {
  ApiDesign,
  DatabaseDesign,
  InterviewState,
  JobStatus,
  PipelineStageName,
  ProjectScale,
  ProjectSnapshot,
  ProjectSummary,
  RefineResult,
  RequirementDocument,
  ReviewReport,
  SubscriptionView,
  SystemDesign,
} from '@archivato/shared';
import {
  ApiError,
  apiDesignApi,
  authApi,
  billingApi,
  databaseDesignApi,
  interviewApi,
  jobsApi,
  requirementsApi,
  reviewApi,
  systemDesignApi,
} from '@/lib/api';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useUpgrade } from '@/components/billing/upgrade-dialog';
import { Breadcrumbs, type Crumb } from '@/components/project/Breadcrumbs';
import { ProjectsDashboard } from '@/components/project/ProjectsDashboard';
import { ProgressPanel } from '@/components/interview/ProgressPanel';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { InterviewPanel } from '@/components/interview/InterviewPanel';
import { ProjectStages, type ActiveJob, type TabKey } from '@/components/project/ProjectStages';
import { Skeleton } from '@/components/ui/skeleton';
import { CommandPalette, type CommandGroup } from '@/components/shared/command-palette';

const STAGE_LABEL: Record<PipelineStageName, string> = {
  requirements: 'Requirement document',
  'system-design': 'System design',
  'database-design': 'Database design',
  'api-design': 'API design',
  review: 'AI review',
};

/** Human label for each stage tab (used by the breadcrumb trail). */
const TAB_LABEL: Record<TabKey, string> = {
  vision: 'Vision',
  requirements: 'Requirements',
  system: 'Architecture',
  database: 'Database',
  api: 'API',
  diagrams: 'Diagrams',
  canvas: 'Canvas',
  review: 'Review',
  roadmap: 'Roadmap',
  export: 'Export',
  apidocs: 'API Docs',
  refine: 'Refine',
  history: 'History',
};

/** Short status label shown next to a project in the command palette. */
const STATUS_HINT: Record<string, string> = {
  collecting: 'Interviewing',
  awaiting_confirmation: 'Review & confirm',
  confirmed: 'Confirmed',
};

/** localStorage key for the active session id, scoped PER USER. */
const sessionKey = (userId: string) => `archivato.sessionId:${userId}`;
const LEGACY_SESSION_KEY = 'archivato.sessionId';

export default function Home() {
  const toast = useToast();
  const confirm = useConfirm();
  const openUpgrade = useUpgrade();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [state, setState] = useState<InterviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  // True while the "New project" form is open on the projects dashboard.
  const [creating, setCreating] = useState(false);

  // New-project form fields.
  const [idea, setIdea] = useState('');
  const [industry, setIndustry] = useState('');
  const [scale, setScale] = useState<ProjectScale | ''>('');

  // Generated artifacts.
  const [doc, setDoc] = useState<RequirementDocument | null>(null);
  const [design, setDesign] = useState<SystemDesign | null>(null);
  const [dbDesign, setDbDesign] = useState<DatabaseDesign | null>(null);
  const [apiDesign, setApiDesign] = useState<ApiDesign | null>(null);
  const [review, setReview] = useState<ReviewReport | null>(null);

  // The async generation job currently running (drives the progress bar).
  const [job, setJob] = useState<ActiveJob | null>(null);
  // Bumped whenever artifacts change, so Version History reloads its list.
  const [versionsReload, setVersionsReload] = useState(0);
  // The active stage tab (lifted here so the Project Wizard can navigate to it).
  const [stageTab, setStageTab] = useState<TabKey>('requirements');
  // True when an open editor/canvas has unsaved edits (drives the leave guard).
  const [dirty, setDirty] = useState(false);

  async function loadSession(sessionId: string) {
    const restored = await interviewApi.get(sessionId);
    setState(restored);
    const [r, sd, db, ad, rv] = await Promise.allSettled([
      requirementsApi.get(sessionId),
      systemDesignApi.get(sessionId),
      databaseDesignApi.get(sessionId),
      apiDesignApi.get(sessionId),
      reviewApi.get(sessionId),
    ]);
    setDoc(r.status === 'fulfilled' ? r.value : null);
    setDesign(sd.status === 'fulfilled' ? sd.value : null);
    setDbDesign(db.status === 'fulfilled' ? db.value : null);
    setApiDesign(ad.status === 'fulfilled' ? ad.value : null);
    setReview(rv.status === 'fulfilled' ? rv.value : null);
  }

  // After login, land on the projects dashboard (NOT auto-opened into the last
  // session) — the user picks which project to work on. Everything is persisted
  // server-side, so opening a project rehydrates its full state on demand.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.me();
        if (cancelled || !me) return;
        setUserId(me.id);
        const [list, subscription] = await Promise.all([
          interviewApi.list(),
          billingApi.subscription().catch(() => null),
        ]);
        if (!cancelled) {
          setProjects(list);
          setSub(subscription);
        }
      } catch {
        /* not signed in / list failed — show the empty dashboard */
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userId && state?.sessionId) {
      localStorage.setItem(sessionKey(userId), state.sessionId);
    }
  }, [userId, state?.sessionId]);

  async function refreshProjects() {
    try {
      const [list, subscription] = await Promise.all([
        interviewApi.list(),
        billingApi.subscription().catch(() => null),
      ]);
      setProjects(list);
      if (subscription) setSub(subscription);
    } catch {
      /* non-fatal */
    }
  }

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  /** Generate one stage asynchronously (BullMQ), tracking live progress. */
  async function generateStage<T>(
    stage: PipelineStageName,
    setter: (value: T) => void,
  ) {
    if (!state) return;
    setBusy(true);
    setError(null);
    setJob({ stage, progress: 0 });
    try {
      const result = await jobsApi.run<T>(state.sessionId, stage, (s: JobStatus) =>
        setJob({ stage, progress: s.progress }),
      );
      setter(result);
      setVersionsReload((k) => k + 1);
      void refreshProjects();
      toast({ title: `${STAGE_LABEL[stage]} generated`, variant: 'success' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({
        title: `Could not generate the ${STAGE_LABEL[stage].toLowerCase()}`,
        description: msg,
        variant: 'error',
      });
    } finally {
      setBusy(false);
      setJob(null);
    }
  }

  /** Delete a project after confirmation; frees a plan quota slot. */
  async function handleDeleteProject(sessionId: string) {
    const ok = await confirm({
      title: 'Delete this project?',
      description:
        'This permanently deletes the project and all of its artifacts ' +
        '(requirements, designs, review, history). This cannot be undone.',
      confirmLabel: 'Delete project',
      cancelLabel: 'Keep project',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await interviewApi.delete(sessionId);
      if (userId) localStorage.removeItem(sessionKey(userId));
      await refreshProjects();
      toast({ title: 'Project deleted', variant: 'success' });
    });
  }

  async function openProject(sessionId: string) {
    setStageTab('requirements');
    await run(async () => {
      await loadSession(sessionId);
      if (userId) localStorage.setItem(sessionKey(userId), sessionId);
    });
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await interviewApi.start({
        idea,
        industry: industry || undefined,
        scale: scale || undefined,
      });
      setState(next);
      setCreating(false);
      void refreshProjects();
    } catch (err) {
      // At the project cap (402) → offer an in-app upgrade instead of a raw error.
      if (err instanceof ApiError && err.status === 402) {
        const upgraded = await openUpgrade({ feature: 'start another project' });
        if (upgraded) await refreshProjects();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer(text: string) {
    if (!state) return;
    const next = await run(() => interviewApi.answer(state.sessionId, text));
    if (next) setState(next);
  }

  async function handleConfirm() {
    if (!state) return;
    const next = await run(() => interviewApi.confirm(state.sessionId));
    if (next) setState(next);
  }

  // After saving edits to an artifact: update it in view. A manual save also
  // bumps the version list + toasts; a debounced autosave (`opts.auto`) stays
  // silent so it doesn't spam while the user is still editing.
  function handleSavedDoc(value: RequirementDocument, opts?: { auto?: boolean }) {
    setDoc(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    void refreshProjects();
    toast({ title: 'Requirements saved', variant: 'success' });
  }
  function handleSavedDesign(value: SystemDesign, opts?: { auto?: boolean }) {
    setDesign(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    toast({ title: 'Architecture saved', variant: 'success' });
  }
  function handleSavedDbDesign(value: DatabaseDesign, opts?: { auto?: boolean }) {
    setDbDesign(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    toast({ title: 'Database saved', variant: 'success' });
  }
  function handleSavedApiDesign(value: ApiDesign, opts?: { auto?: boolean }) {
    setApiDesign(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    toast({ title: 'API design saved', variant: 'success' });
  }

  function handleRefined(result: RefineResult) {
    setDoc(result.requirementDocument);
    setDesign(result.systemDesign);
    setDbDesign(result.databaseDesign);
    setApiDesign(result.apiDesign);
    if (result.reviewReport) setReview(result.reviewReport);
    setVersionsReload((k) => k + 1);
    toast({ title: 'Design refined', variant: 'success' });
  }

  /** Apply a restored version: replace every artifact with the snapshot's. */
  function handleRestored(snapshot: ProjectSnapshot) {
    setDoc(snapshot.requirements);
    setDesign(snapshot.systemDesign);
    setDbDesign(snapshot.databaseDesign);
    setApiDesign(snapshot.apiDesign);
    setReview(snapshot.review);
    setVersionsReload((k) => k + 1);
    void refreshProjects();
    toast({ title: 'Project restored to selected version', variant: 'success' });
  }

  function reset() {
    if (userId && typeof window !== 'undefined') {
      localStorage.removeItem(sessionKey(userId));
    }
    setState(null);
    setDoc(null);
    setDesign(null);
    setDbDesign(null);
    setApiDesign(null);
    setReview(null);
    setIdea('');
    setIndustry('');
    setScale('');
    setError(null);
  }

  /** Warn (via the in-app dialog) before discarding unsaved editor/canvas edits. */
  async function confirmLeave() {
    if (!dirty) return true;
    return confirm({
      title: 'Discard unsaved changes?',
      description:
        'You have unsaved edits on this stage. Leaving now will discard them.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      destructive: true,
    });
  }

  /** Change the active stage tab, guarding against unsaved edits. */
  async function goToStage(next: TabKey) {
    if (!(await confirmLeave())) return;
    setDirty(false);
    setStageTab(next);
  }

  /**
   * Return to the projects dashboard without deleting anything — the current
   * project stays in the database and reappears in the (refreshed) list.
   */
  async function backToProjects() {
    if (!(await confirmLeave())) return;
    setDirty(false);
    reset();
    setCreating(false);
    void refreshProjects();
  }

  // ⌘K / Ctrl+K toggles the command palette (jump between projects + stages).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Native warning if the user closes/reloads the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (restoring) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
        <Skeleton className="mt-5 h-12 w-full rounded-lg" />
        <div className="mt-6 mb-4 flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Breadcrumb trail: Projects / ‹project name› / ‹current stage›.
  let crumbs: Crumb[] = [];
  if (state) {
    const ideaText =
      projects.find((p) => p.sessionId === state.sessionId)?.idea ??
      state.intent?.summary ??
      'Project';
    const projectName =
      ideaText.length > 36 ? `${ideaText.slice(0, 36).trimEnd()}…` : ideaText;
    crumbs = [
      { label: 'Projects', onClick: backToProjects },
      {
        label: projectName,
        title: ideaText,
        onClick:
          state.status === 'confirmed'
            ? () => goToStage('requirements')
            : undefined,
      },
      {
        label:
          state.status === 'confirmed' ? TAB_LABEL[stageTab] : 'Interview',
      },
    ];
  }

  // ⌘K command palette: quick actions, jump to a project, or (in a confirmed
  // project) jump to any reachable stage.
  const stageAvailable: Record<TabKey, boolean> = {
    vision: true,
    requirements: true,
    system: !!doc,
    database: !!design,
    api: !!dbDesign,
    diagrams: !!design,
    canvas: !!design,
    review: !!apiDesign,
    roadmap: !!apiDesign,
    export: !!apiDesign,
    apidocs: !!apiDesign,
    refine: !!apiDesign,
    history: !!doc,
  };
  const paletteGroups: CommandGroup[] = [
    {
      heading: 'Actions',
      items: [
        {
          id: 'new-project',
          label: 'New project',
          icon: Plus,
          run: async () => {
            await backToProjects();
            setCreating(true);
          },
        },
        {
          id: 'all-projects',
          label: 'Back to projects',
          icon: LayoutGrid,
          run: () => void backToProjects(),
        },
        {
          id: 'settings',
          label: 'Account settings',
          icon: Settings,
          run: () => router.push('/settings'),
        },
      ],
    },
    {
      heading: 'Projects',
      items: projects.map((p) => ({
        id: `project-${p.sessionId}`,
        label: p.idea,
        hint: STATUS_HINT[p.status],
        icon: FolderOpen,
        run: () => void openProject(p.sessionId),
      })),
    },
    ...(state?.status === 'confirmed'
      ? [
          {
            heading: 'Stages',
            items: (Object.keys(TAB_LABEL) as TabKey[])
              .filter((t) => stageAvailable[t])
              .map((t) => ({
                id: `stage-${t}`,
                label: TAB_LABEL[t],
                hint: 'Stage',
                run: () => void goToStage(t),
              })),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        groups={paletteGroups}
      />
      {!state && (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">Archivato AI Builder</h1>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="rounded border border-border px-1 text-[10px]">
                ⌘K
              </kbd>
            </button>
          </div>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            AI Software Architecture Generator — turn an idea into a full system
            design.
          </p>

          {sub && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold capitalize">{sub.plan} plan</span>{' '}
                <span className="text-muted-foreground">
                  · {projects.length} of {sub.projectQuota} project
                  {sub.projectQuota === 1 ? '' : 's'} used
                </span>
              </span>
              {sub.plan === 'free' ? (
                <button
                  type="button"
                  onClick={async () => {
                    const upgraded = await openUpgrade();
                    if (upgraded) await refreshProjects();
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Upgrade to Pro
                </button>
              ) : (
                <Link
                  href="/settings"
                  className="font-medium text-primary hover:underline"
                >
                  Manage plan
                </Link>
              )}
            </div>
          )}

          <ProjectsDashboard
            projects={projects}
            creating={creating}
            setCreating={setCreating}
            busy={busy}
            error={error}
            idea={idea}
            setIdea={setIdea}
            industry={industry}
            setIndustry={setIndustry}
            scale={scale}
            setScale={setScale}
            onStart={handleStart}
            onOpen={openProject}
            onDelete={handleDeleteProject}
          />
        </>
      )}

      {state && (
        <div className="space-y-4">
          <Breadcrumbs items={crumbs} />
          {state.intent?.summary && (
            <p
              className="-mt-2 truncate text-sm text-muted-foreground"
              title={state.intent.summary}
            >
              {state.intent.summary}
            </p>
          )}

          <ProjectWizard
            state={state}
            doc={doc}
            design={design}
            dbDesign={dbDesign}
            apiDesign={apiDesign}
            review={review}
            isPro={sub?.plan === 'pro'}
            onNavigate={
              state.status === 'confirmed'
                ? (t) => goToStage(t as TabKey)
                : undefined
            }
          />

          {state.status !== 'confirmed' && (
            <>
              <ProgressPanel state={state} />
              <InterviewPanel
                state={state}
                busy={busy}
                error={error}
                onAnswer={handleAnswer}
                onConfirm={handleConfirm}
              />
            </>
          )}

          {state.status === 'confirmed' && (
            <ProjectStages
              sessionId={state.sessionId}
              summary={state.summary}
              doc={doc}
              design={design}
              dbDesign={dbDesign}
              apiDesign={apiDesign}
              review={review}
              isPro={sub?.plan === 'pro'}
              busy={busy}
              job={job}
              error={error}
              versionsReload={versionsReload}
              tab={stageTab}
              onTabChange={goToStage}
              dirty={dirty}
              onDirty={setDirty}
              onGenerateRequirements={() =>
                generateStage<RequirementDocument>('requirements', setDoc)
              }
              onGenerateSystem={() =>
                generateStage<SystemDesign>('system-design', setDesign)
              }
              onGenerateDatabase={() =>
                generateStage<DatabaseDesign>('database-design', setDbDesign)
              }
              onGenerateApi={() =>
                generateStage<ApiDesign>('api-design', setApiDesign)
              }
              onGenerateReview={() =>
                generateStage<ReviewReport>('review', setReview)
              }
              onSavedDoc={handleSavedDoc}
              onSavedDesign={handleSavedDesign}
              onSavedDbDesign={handleSavedDbDesign}
              onSavedApiDesign={handleSavedApiDesign}
              onRefined={handleRefined}
              onRestored={handleRestored}
              onUpgraded={refreshProjects}
            />
          )}
        </div>
      )}
    </div>
  );
}
