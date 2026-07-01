'use client';

import { useEffect, useState } from 'react';
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
  SystemDesign,
} from '@archivato/shared';
import {
  apiDesignApi,
  authApi,
  databaseDesignApi,
  interviewApi,
  jobsApi,
  requirementsApi,
  reviewApi,
  systemDesignApi,
} from '../lib/api';
import { useToast } from './toast';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { ProjectsDashboard } from './ProjectsDashboard';
import { ProgressPanel } from './ProgressPanel';
import { ProjectWizard } from './ProjectWizard';
import { InterviewPanel } from './InterviewPanel';
import { ProjectStages, type ActiveJob, type TabKey } from './ProjectStages';

const STAGE_LABEL: Record<PipelineStageName, string> = {
  requirements: 'Requirement document',
  'system-design': 'System design',
  'database-design': 'Database design',
  'api-design': 'API design',
  review: 'AI review',
};

/** Human label for each stage tab (used by the breadcrumb trail). */
const TAB_LABEL: Record<TabKey, string> = {
  requirements: 'Requirements',
  system: 'Architecture',
  database: 'Database',
  api: 'API',
  diagrams: 'Diagrams',
  canvas: 'Canvas',
  review: 'Review',
  export: 'Export',
  apidocs: 'API Docs',
  refine: 'Refine',
  history: 'History',
};

/** localStorage key for the active session id, scoped PER USER. */
const sessionKey = (userId: string) => `archivato.sessionId:${userId}`;
const LEGACY_SESSION_KEY = 'archivato.sessionId';

export default function Home() {
  const toast = useToast();
  const [state, setState] = useState<InterviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
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
        const list = await interviewApi.list();
        if (!cancelled) setProjects(list);
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
      setProjects(await interviewApi.list());
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

  async function openProject(sessionId: string) {
    setStageTab('requirements');
    await run(async () => {
      await loadSession(sessionId);
      if (userId) localStorage.setItem(sessionKey(userId), sessionId);
    });
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const next = await run(() =>
      interviewApi.start({
        idea,
        industry: industry || undefined,
        scale: scale || undefined,
      }),
    );
    if (next) {
      setState(next);
      setCreating(false);
      void refreshProjects();
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

  /** After saving edits to an artifact: update it in view + bump version list. */
  function handleSavedDoc(value: RequirementDocument) {
    setDoc(value);
    setVersionsReload((k) => k + 1);
    void refreshProjects();
    toast({ title: 'Requirements saved', variant: 'success' });
  }
  function handleSavedDesign(value: SystemDesign) {
    setDesign(value);
    setVersionsReload((k) => k + 1);
    toast({ title: 'Architecture saved', variant: 'success' });
  }
  function handleSavedDbDesign(value: DatabaseDesign) {
    setDbDesign(value);
    setVersionsReload((k) => k + 1);
    toast({ title: 'Database saved', variant: 'success' });
  }
  function handleSavedApiDesign(value: ApiDesign) {
    setApiDesign(value);
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

  /**
   * Return to the projects dashboard without deleting anything — the current
   * project stays in the database and reappears in the (refreshed) list.
   */
  function backToProjects() {
    reset();
    setCreating(false);
    void refreshProjects();
  }

  if (restoring) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm">Loading your projects…</p>
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
            ? () => setStageTab('requirements')
            : undefined,
      },
      {
        label:
          state.status === 'confirmed' ? TAB_LABEL[stageTab] : 'Interview',
      },
    ];
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      {!state && (
        <>
          <h1 className="text-2xl font-bold">Archivato AI Builder</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            AI Software Architecture Generator — turn an idea into a full system
            design.
          </p>

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
            onNavigate={
              state.status === 'confirmed'
                ? (t) => setStageTab(t as TabKey)
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
              busy={busy}
              job={job}
              error={error}
              versionsReload={versionsReload}
              tab={stageTab}
              onTabChange={setStageTab}
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
            />
          )}
        </div>
      )}
    </div>
  );
}
