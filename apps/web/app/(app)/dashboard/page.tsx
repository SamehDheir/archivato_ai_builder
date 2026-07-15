'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  FolderOpen,
  LayoutGrid,
  LifeBuoy,
  Plus,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type {
  ApiDesign,
  DatabaseDesign,
  InterviewState,
  Permission,
  PipelineStageName,
  ProjectOverview,
  ProjectScale,
  ProjectSnapshot,
  RefineResult,
  RequirementDocument,
  ReviewReport,
  SubscriptionView,
  SystemDesign,
} from '@archivato/shared';
import { hasPermission, isStaffUser, sharePath } from '@archivato/shared';
import {
  ApiError,
  apiDesignApi,
  authApi,
  billingApi,
  databaseDesignApi,
  exportApi,
  interviewApi,
  projectsApi,
  requirementsApi,
  reviewApi,
  shareApi,
  systemDesignApi,
} from '@/lib/api';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useUpgrade } from '@/components/billing/upgrade-dialog';
import { Breadcrumbs, type Crumb } from '@/components/project/Breadcrumbs';
import {
  ProjectsDashboard,
  type ExportFormat,
} from '@/components/project/ProjectsDashboard';
import { ProgressPanel } from '@/components/interview/ProgressPanel';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { InterviewPanel } from '@/components/interview/InterviewPanel';
import { ProjectStages, type StreamState, type TabKey } from '@/components/project/ProjectStages';
import { streamStage, reduceStreamEvent, emptyStreamView } from '@/lib/stream';
import { saveFile } from '@/lib/download';
import { Skeleton } from '@/components/ui/skeleton';
import { CommandPalette, type CommandGroup } from '@/components/shared/command-palette';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminOverview } from '@/components/admin/AdminOverview';

/**
 * The read-only Example tour carries a ~1k-line artifact fixture plus five extra
 * artifact views, and most users never open it — so keep it out of the
 * dashboard's initial bundle and fetch it only when they ask for it.
 */
const ExampleProjectView = dynamic(
  () =>
    import('@/components/project/ExampleProjectView').then(
      (m) => m.ExampleProjectView,
    ),
  { ssr: false },
);

/** localStorage key for the active session id, scoped PER USER. */
const sessionKey = (userId: string) => `archivato.sessionId:${userId}`;
const LEGACY_SESSION_KEY = 'archivato.sessionId';

/** localStorage key remembering the last stage tab viewed per project (Smart Resume). */
const lastTabKey = (userId: string, sessionId: string) =>
  `archivato.lastTab:${userId}:${sessionId}`;

export default function Home() {
  const toast = useToast();
  const confirm = useConfirm();
  const openUpgrade = useUpgrade();
  const router = useRouter();
  const { t } = useTranslation('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [state, setState] = useState<InterviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Staff (support / billing / admin) are console accounts — they can't create
  // or run projects; the dashboard shows their consoles instead of the creator.
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [projects, setProjects] = useState<ProjectOverview[]>([]);
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  // True while the "New project" form is open on the projects dashboard.
  const [creating, setCreating] = useState(false);
  // True while the read-only Example project tour is open (replaces the hub).
  const [viewingExample, setViewingExample] = useState(false);

  // New-scoping form fields.
  const [idea, setIdea] = useState('');
  const [industry, setIndustry] = useState('');
  const [scale, setScale] = useState<ProjectScale | ''>('');
  const [clientName, setClientName] = useState('');
  // Notes-first mode: pasted call notes seed the interview as its first turn.
  const [notes, setNotes] = useState('');

  // Generated artifacts.
  const [doc, setDoc] = useState<RequirementDocument | null>(null);
  const [design, setDesign] = useState<SystemDesign | null>(null);
  const [dbDesign, setDbDesign] = useState<DatabaseDesign | null>(null);
  const [apiDesign, setApiDesign] = useState<ApiDesign | null>(null);
  const [review, setReview] = useState<ReviewReport | null>(null);

  // The streaming generation currently running (drives the live console).
  const [stream, setStream] = useState<StreamState | null>(null);
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
        setPermissions(me.permissions ?? []);
        const [list, subscription] = await Promise.all([
          projectsApi.list(),
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

  // Re-validate permissions when the tab regains focus or is restored from the
  // browser's back/forward cache. Permissions resolve fresh server-side, so this
  // makes a just-revoked permission's console disappear (and a just-granted one
  // appear) without a hard reload.
  useEffect(() => {
    const revalidate = () =>
      authApi
        .me()
        .then((me) => me && setPermissions(me.permissions ?? []))
        .catch(() => undefined);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void revalidate();
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  async function refreshProjects() {
    try {
      const [list, subscription] = await Promise.all([
        projectsApi.list(),
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
    setStream({ stage, view: emptyStreamView });
    try {
      const result = await streamStage<T>(state.sessionId, stage, (event) =>
        setStream((cur) =>
          cur ? { stage, view: reduceStreamEvent(cur.view, event) } : cur,
        ),
      );
      setter(result);
      setVersionsReload((k) => k + 1);
      void refreshProjects();
      toast({
        title: t('toast.generated', { stage: t(`stage.${stage}`) }),
        variant: 'success',
      });
    } catch (e) {
      // A Pro-gated stage reached without Pro (defense-in-depth) pops the modal;
      // on upgrade we refresh so the user can re-run the (now unlocked) stage.
      if (e instanceof ApiError && e.status === 402) {
        const upgraded = await openUpgrade({ feature: t(`stage.${stage}`) });
        if (upgraded) void refreshProjects();
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toast({
          title: t('toast.generateFailed', { stage: t(`stage.${stage}`) }),
          description: msg,
          variant: 'error',
        });
      }
    } finally {
      setBusy(false);
      setStream(null);
    }
  }

  /** Delete a project after confirmation; frees a plan quota slot. */
  async function handleDeleteProject(sessionId: string) {
    const ok = await confirm({
      title: t('confirm.deleteTitle'),
      description: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteConfirm'),
      cancelLabel: t('confirm.deleteCancel'),
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await interviewApi.delete(sessionId);
      if (userId) localStorage.removeItem(sessionKey(userId));
      await refreshProjects();
      toast({ title: t('toast.deleted'), variant: 'success' });
    });
  }

  /** Rename a project (set/clear its display name) from a card. */
  async function handleRenameProject(sessionId: string, title: string) {
    try {
      await interviewApi.update(sessionId, { title });
      await refreshProjects();
      toast({ title: t('toast.renamed'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('toast.renameFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  /** Set (or clear) the client a scoping is for, from a card. */
  async function handleSetClient(sessionId: string, name: string) {
    try {
      await interviewApi.update(sessionId, { clientName: name });
      await refreshProjects();
      toast({ title: t('toast.clientSaved'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('toast.clientFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  /**
   * Copy the public client link, minting it first if this scoping has never been
   * shared. `shareApi.create` is idempotent — an existing link comes back
   * unchanged — so the "already sent" and "first send" paths are the same call,
   * and a link the owner has already emailed can never be silently rotated.
   *
   * The card only enables this once the design is shareable, but the server owns
   * that gate (409 below the database design); we surface it rather than pretend.
   */
  async function handleCopyLink(sessionId: string): Promise<boolean> {
    try {
      const link = await shareApi.create(sessionId);
      await navigator.clipboard.writeText(
        `${window.location.origin}${sharePath(link.token)}`,
      );
      // Refresh so the card flips to "Sent to client" the moment a link exists.
      void refreshProjects();
      toast({ title: t('toast.linkCopied'), variant: 'success' });
      return true;
    } catch (e) {
      const incomplete = e instanceof ApiError && e.status === 409;
      toast({
        title: incomplete ? t('toast.linkIncomplete') : t('toast.linkFailed'),
        description: incomplete
          ? undefined
          : e instanceof Error
            ? e.message
            : String(e),
        variant: 'error',
      });
      return false;
    }
  }

  /** Direct-export a project from its card (reuses the Pro export endpoints). */
  async function handleExportProject(sessionId: string, format: ExportFormat) {
    const base = `archivato-${sessionId}`;
    try {
      if (format === 'markdown') {
        saveFile(`${base}.md`, await exportApi.markdown(sessionId), 'text/markdown');
      } else if (format === 'openapi') {
        const spec = await exportApi.openapi(sessionId);
        saveFile(
          `${base}-openapi.json`,
          JSON.stringify(spec, null, 2),
          'application/json',
        );
      } else {
        const bundle = await exportApi.json(sessionId);
        saveFile(
          `${base}.json`,
          JSON.stringify(bundle, null, 2),
          'application/json',
        );
      }
    } catch (e) {
      // Pro wall → upgrade modal; incomplete pipeline → hint; else a plain error.
      if (e instanceof ApiError && e.status === 402) {
        const upgraded = await openUpgrade({ feature: t('toast.exportFeature') });
        if (upgraded) await refreshProjects();
      } else if (e instanceof ApiError && e.status === 409) {
        toast({ title: t('toast.exportIncomplete'), variant: 'error' });
      } else {
        toast({
          title: t('toast.exportFailed'),
          description: e instanceof Error ? e.message : String(e),
          variant: 'error',
        });
      }
    }
  }

  async function openProject(sessionId: string) {
    // Smart Resume: reopen on the tab the user last viewed for this project
    // (falls back to requirements; ProjectStages re-guards availability).
    let resumeTab: TabKey = 'requirements';
    if (userId) {
      try {
        const saved = localStorage.getItem(lastTabKey(userId, sessionId));
        if (saved) resumeTab = saved as TabKey;
      } catch {
        /* storage blocked */
      }
    }
    setStageTab(resumeTab);
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
        clientName: clientName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setState(next);
      setCreating(false);
      void refreshProjects();
    } catch (err) {
      // At the project cap (402) → offer an in-app upgrade instead of a raw error.
      if (err instanceof ApiError && err.status === 402) {
        const upgraded = await openUpgrade({
          feature: t('upgradeFeature.anotherProject'),
        });
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

  /** Correct a slot at the confirmation gate (appends a correction to the transcript). */
  async function handleEditSlot(slotKey: string, value: string) {
    if (!state) return;
    const next = await run(() =>
      interviewApi.editSlot(state.sessionId, slotKey, value),
    );
    if (next) setState(next);
  }

  async function handleConfirm() {
    if (!state) return;
    const next = await run(() => interviewApi.confirm(state.sessionId));
    if (!next) return;
    setState(next);
    // The user already confirmed the requirements — don't make them click
    // "Generate" on an empty Requirements tab. Kick off the first artifact
    // immediately (the sessionId is stable through the interview, so the
    // still-stale `state` closure in generateStage points at the same session).
    if (next.status === 'confirmed' && !doc) {
      setStageTab('requirements');
      void generateStage<RequirementDocument>('requirements', setDoc);
    }
  }

  // After saving edits to an artifact: update it in view. A manual save also
  // bumps the version list + toasts; a debounced autosave (`opts.auto`) stays
  // silent so it doesn't spam while the user is still editing.
  function handleSavedDoc(value: RequirementDocument, opts?: { auto?: boolean }) {
    setDoc(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    void refreshProjects();
    toast({ title: t('toast.requirementsSaved'), variant: 'success' });
  }
  function handleSavedDesign(value: SystemDesign, opts?: { auto?: boolean }) {
    setDesign(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    toast({ title: t('toast.architectureSaved'), variant: 'success' });
  }
  function handleSavedDbDesign(value: DatabaseDesign, opts?: { auto?: boolean }) {
    setDbDesign(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    toast({ title: t('toast.databaseSaved'), variant: 'success' });
  }
  function handleSavedApiDesign(value: ApiDesign, opts?: { auto?: boolean }) {
    setApiDesign(value);
    if (opts?.auto) return;
    setVersionsReload((k) => k + 1);
    toast({ title: t('toast.apiSaved'), variant: 'success' });
  }

  function handleRefined(result: RefineResult) {
    setDoc(result.requirementDocument);
    setDesign(result.systemDesign);
    setDbDesign(result.databaseDesign);
    setApiDesign(result.apiDesign);
    if (result.reviewReport) setReview(result.reviewReport);
    setVersionsReload((k) => k + 1);
    toast({ title: t('toast.refined'), variant: 'success' });
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
    toast({ title: t('toast.restored'), variant: 'success' });
  }

  function reset() {
    if (userId && typeof window !== 'undefined') {
      localStorage.removeItem(sessionKey(userId));
    }
    // Leave the read-only Example tour too. Without this, anything that routes
    // through reset() (the Projects breadcrumb, the ⌘K "New project" / "Back to
    // projects" commands) would clear the session but leave `viewingExample`
    // set, so the example kept rendering and the view the user actually asked
    // for never appeared.
    setViewingExample(false);
    setState(null);
    setDoc(null);
    setDesign(null);
    setDbDesign(null);
    setApiDesign(null);
    setReview(null);
    setIdea('');
    setIndustry('');
    setScale('');
    setClientName('');
    setNotes('');
    setError(null);
  }

  /** Warn (via the in-app dialog) before discarding unsaved editor/canvas edits. */
  async function confirmLeave() {
    if (!dirty) return true;
    return confirm({
      title: t('confirm.leaveTitle'),
      description: t('confirm.leaveBody'),
      confirmLabel: t('confirm.leaveConfirm'),
      cancelLabel: t('confirm.leaveCancel'),
      destructive: true,
    });
  }

  /** Change the active stage tab, guarding against unsaved edits. */
  async function goToStage(next: TabKey) {
    if (!(await confirmLeave())) return;
    setDirty(false);
    setStageTab(next);
    // Remember where the user is, per project, for Smart Resume next time.
    const sid = state?.sessionId;
    if (userId && sid) {
      try {
        localStorage.setItem(lastTabKey(userId, sid), next);
      } catch {
        /* storage blocked */
      }
    }
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

  // Staff accounts (any permission) are console operators — they can't create
  // projects. Give them the unified admin sidebar shell + a console overview
  // instead of the project dashboard.
  if (isStaffUser(permissions)) {
    return (
      <AdminShell>
        <AdminOverview permissions={permissions} />
      </AdminShell>
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
      { label: t('breadcrumb.projects'), onClick: backToProjects },
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
          state.status === 'confirmed'
            ? t(`tab.${stageTab}`)
            : t('tab.interview'),
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
    cost: !!apiDesign,
    threat: !!apiDesign,
    qa: !!apiDesign,
    export: !!apiDesign,
    apidocs: !!apiDesign,
    refine: !!apiDesign,
    history: !!doc,
  };
  // Staff (any permission) are console accounts: no project creation. They see
  // the consoles their roles grant instead.
  const isStaff = isStaffUser(permissions);
  const canViewAdmin = hasPermission(permissions, 'admin:analytics');
  const canSupport = hasPermission(permissions, 'support:read_all');
  const paletteGroups: CommandGroup[] = [
    {
      heading: t('palette.actions'),
      items: [
        // Staff manage the platform (no project creation); everyone else can
        // start a new project. Staff get quick links to the consoles they hold.
        ...(!isStaff
          ? [
              {
                id: 'new-project',
                label: t('palette.newProject'),
                icon: Plus,
                run: async () => {
                  await backToProjects();
                  setCreating(true);
                },
              },
            ]
          : []),
        ...(canSupport
          ? [
              {
                id: 'support',
                label: t('palette.support'),
                icon: LifeBuoy,
                run: () => router.push('/support/admin'),
              },
            ]
          : []),
        ...(canViewAdmin
          ? [
              {
                id: 'admin',
                label: t('palette.admin'),
                icon: ShieldCheck,
                run: () => router.push('/admin'),
              },
            ]
          : []),
        ...(!isStaff
          ? [
              {
                id: 'all-projects',
                label: t('palette.backToProjects'),
                icon: LayoutGrid,
                run: () => void backToProjects(),
              },
            ]
          : []),
        {
          id: 'settings',
          label: t('palette.settings'),
          icon: Settings,
          run: () => router.push('/settings'),
        },
      ],
    },
    {
      heading: t('palette.projects'),
      items: projects.map((p) => ({
        id: `project-${p.sessionId}`,
        label: p.idea,
        hint: t(`status.${p.status}`),
        icon: FolderOpen,
        run: () => void openProject(p.sessionId),
      })),
    },
    ...(state?.status === 'confirmed'
      ? [
          {
            heading: t('palette.stages'),
            items: (Object.keys(stageAvailable) as TabKey[])
              .filter((tab) => stageAvailable[tab])
              .map((tab) => ({
                id: `stage-${tab}`,
                label: t(`tab.${tab}`),
                hint: t('palette.stage'),
                run: () => void goToStage(tab),
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
      {!state && viewingExample && (
        <ExampleProjectView
          onClose={() => setViewingExample(false)}
          onStartOwn={() => {
            setViewingExample(false);
            setCreating(true);
          }}
        />
      )}

      {!state && !viewingExample && (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">{t('appTitle')}</h1>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              {t('search')}
              <kbd className="rounded border border-border px-1 text-[10px]">
                ⌘K
              </kbd>
            </button>
          </div>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            {t('appSubtitle')}
          </p>

          {(
            <>
              {/* Don't sell before any value is earned: the quota/upsell banner
                  appears only once the user owns at least one project. */}
              {sub && projects.length > 0 && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold capitalize">
                      {t('quota.plan', { plan: sub.plan })}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      ·{' '}
                      {t('quota.used', {
                        count: projects.length,
                        quota: sub.projectQuota,
                      })}
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
                      {t('quota.upgrade')}
                    </button>
                  ) : (
                    <Link
                      href="/settings"
                      className="font-medium text-primary hover:underline"
                    >
                      {t('quota.manage')}
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
                clientName={clientName}
                setClientName={setClientName}
                notes={notes}
                setNotes={setNotes}
                onStart={handleStart}
                onOpen={openProject}
                onDelete={handleDeleteProject}
                onRename={handleRenameProject}
                onSetClient={handleSetClient}
                onCopyLink={handleCopyLink}
                onExport={handleExportProject}
                onOpenExample={() => setViewingExample(true)}
              />
            </>
          )}
        </>
      )}

      {state && (
        <div className="space-y-4">
          <Breadcrumbs items={crumbs} />
          {state.intent?.summary && (
            <p
              dir="auto"
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
                onEditSlot={handleEditSlot}
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
              stream={stream}
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
              weeklyRate={
                projects.find((p) => p.sessionId === state.sessionId)?.weeklyRate ??
                null
              }
              onSaveWeeklyRate={async (rate) => {
                await interviewApi.update(state.sessionId, { weeklyRate: rate });
                await refreshProjects();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
