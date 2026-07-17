'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Building2,
  Check,
  Compass,
  Download,
  FileText,
  LayoutGrid,
  Link2,
  List,
  ListChecks,
  MoreVertical,
  Pencil,
  PlayCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  clientLinkState,
  projectProgress,
  type ClientLinkState,
  type InterviewStatus,
  type ProjectOverview,
  type ProjectScale,
} from '@archivato/shared';
import { STARTER_IDEAS } from '@/lib/starter-ideas';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const SCALES: ProjectScale[] = ['mvp', 'startup', 'enterprise'];

/** The direct-export formats offered from a project card. */
export type ExportFormat = 'json' | 'markdown' | 'openapi';

type ProjectsView = 'grid' | 'list';
/** Remembers the grid/list choice across visits. */
const VIEW_STORAGE = 'archivato.projectsView';

function readStoredView(): ProjectsView {
  if (typeof window === 'undefined') return 'grid';
  try {
    return localStorage.getItem(VIEW_STORAGE) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Badge colour per status; the label is translated (`dashboard.status.*`). */
const STATUS_VARIANT: Record<
  InterviewStatus,
  'secondary' | 'warning' | 'primary'
> = {
  collecting: 'secondary',
  awaiting_confirmation: 'warning',
  confirmed: 'primary',
};

/** A project's display label: the user-set title, else the raw idea. */
const displayName = (p: ProjectOverview): string => p.title?.trim() || p.idea;

/** Shared props for the per-project actions. */
interface CardActions {
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onSetClient: (clientName: string) => void;
  /** Mint-if-needed and copy the public client link. Resolves false on failure. */
  onCopyLink: () => Promise<boolean>;
  onExport: (format: ExportFormat) => void;
}

/**
 * The post-login hub: a list of the user's projects (open any to resume) plus a
 * "new project" form. The form is shown when explicitly creating or when the
 * user has no projects yet (first run).
 */
export function ProjectsDashboard({
  projects,
  creating,
  setCreating,
  busy,
  error,
  idea,
  setIdea,
  industry,
  setIndustry,
  scale,
  setScale,
  clientName,
  setClientName,
  notes,
  setNotes,
  onStart,
  onOpen,
  onDelete,
  onRename,
  onSetClient,
  onCopyLink,
  onExport,
  onOpenExample,
  usage,
}: {
  projects: ProjectOverview[];
  creating: boolean;
  setCreating: (value: boolean) => void;
  busy: boolean;
  error: string | null;
  idea: string;
  setIdea: (value: string) => void;
  industry: string;
  setIndustry: (value: string) => void;
  scale: ProjectScale | '';
  setScale: (value: ProjectScale | '') => void;
  clientName: string;
  setClientName: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  onStart: (e: React.FormEvent) => void;
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onSetClient: (sessionId: string, clientName: string) => void;
  onCopyLink: (sessionId: string) => Promise<boolean>;
  onExport: (sessionId: string, format: ExportFormat) => void;
  /** Open the read-only Example project (a finished sample, no quota impact). */
  onOpenExample: () => void;
  /**
   * The plan/quota indicator, rendered beside the "New client scoping" button.
   *
   * It arrives as a node rather than as `{plan, used, quota}` because the quota
   * rules (unlimited = null, the UTC calendar-month window) live in the page
   * that owns the subscription — duplicating them here would give the banner and
   * the server's 402 two different opinions about when the month starts.
   */
  usage?: React.ReactNode;
}) {
  const { t } = useTranslation('dashboard');
  const showForm = creating || projects.length === 0;
  const [view, setView] = useState<ProjectsView>(readStoredView);
  // How the owner seeds the interview: answer step by step, or paste call notes.
  const [mode, setMode] = useState<'steps' | 'notes'>('steps');

  const chooseMode = (next: 'steps' | 'notes') => {
    setMode(next);
    // Leaving notes mode must not smuggle stale notes into a step-by-step start.
    if (next === 'steps') setNotes('');
  };

  const changeView = (next: ProjectsView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE, next);
    } catch {
      /* storage blocked */
    }
  };

  const actionsFor = (p: ProjectOverview): CardActions => ({
    busy,
    onOpen: () => onOpen(p.sessionId),
    onDelete: () => onDelete(p.sessionId),
    onRename: (title) => onRename(p.sessionId, title),
    onSetClient: (value) => onSetClient(p.sessionId, value),
    onCopyLink: () => onCopyLink(p.sessionId),
    onExport: (format) => onExport(p.sessionId, format),
  });

  // Most recently updated project (the list is server-sorted desc by updatedAt).
  const latest = projects[0];

  return (
    <div className="space-y-4">
      {/*
        The action bar. "New client scoping" is the ONLY accent-filled button on
        this page — that is what makes it read as the primary action from across
        the room. The usage indicator sits beside it (quiet, muted) rather than in
        the full-width banner it used to occupy: a plan meter is context for the
        button next to it, not an announcement that deserves its own row above the
        work.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-h3 font-semibold">{t('projects.heading')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {usage}
          {!showForm && projects.length > 0 && (
            <ViewToggle view={view} onChange={changeView} />
          )}
          {projects.length > 0 &&
            (creating ? (
              <Button variant="secondary" onClick={() => setCreating(false)}>
                {t('projects.back')}
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t('projects.new')}
              </Button>
            ))}
        </div>
      </div>

      <ExampleBanner onOpen={onOpenExample} />

      {showForm ? (
        <Card>
          <CardHeader>
            {/* First run: the workflow graphic leads, because on an empty account
                this card is the entire product and a form with no context is just
                homework. Returning users creating a second scoping already know
                the workflow, so they skip straight to the form. */}
            {projects.length === 0 && <WorkflowGraphic />}
            <CardTitle className="flex items-center gap-2 text-h3">
              <Sparkles className="h-5 w-5 text-primary" />
              {projects.length === 0
                ? t('projects.startFirst')
                : t('projects.newTitle')}
            </CardTitle>
            {/* On an empty account this is the only thing on screen, so it has to
                teach the workflow — bring the call's answers, run the interview,
                send the proposal — not describe the pipeline's internals. */}
            <p className="measure text-small text-muted-foreground">
              {projects.length === 0
                ? t('projects.emptyHelp')
                : t('projects.formHelp')}
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onStart}>
              <ModeToggle mode={mode} onChange={chooseMode} />

              {mode === 'steps' && (
                <StarterIdeas
                  onPick={(next) => {
                    setIdea(next.idea);
                    setIndustry(next.industry);
                    setScale(next.scale);
                  }}
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="idea">{t('projects.ideaLabel')}</Label>
                <Textarea
                  id="idea"
                  dir="auto"
                  placeholder={t('projects.ideaPlaceholder')}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  required
                />
              </div>

              {mode === 'notes' && (
                <div className="space-y-1.5">
                  <Label htmlFor="notes">{t('projects.notesLabel')}</Label>
                  <Textarea
                    id="notes"
                    dir="auto"
                    rows={8}
                    maxLength={20000}
                    placeholder={t('projects.notesPlaceholder')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('projects.notesHint')}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="clientName">{t('projects.clientLabel')}</Label>
                <Input
                  id="clientName"
                  dir="auto"
                  placeholder={t('projects.clientPlaceholder')}
                  value={clientName}
                  maxLength={120}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="industry">{t('projects.industryLabel')}</Label>
                  <Input
                    id="industry"
                    dir="auto"
                    placeholder={t('projects.industryPlaceholder')}
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scale">{t('projects.scaleLabel')}</Label>
                  <Select
                    value={scale}
                    onValueChange={(v) => setScale(v as ProjectScale)}
                  >
                    <SelectTrigger id="scale">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCALES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`scale.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={busy || idea.trim().length < 10}>
                {busy ? t('projects.starting') : t('projects.start')}
              </Button>
              {idea.trim().length > 0 && idea.trim().length < 10 && (
                <p className="text-xs text-muted-foreground">
                  {t('projects.ideaTooShort')}
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          {latest && (
            <ContinueBanner
              project={latest}
              busy={busy}
              onOpen={() => onOpen(latest.sessionId)}
            />
          )}

          {view === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard key={p.sessionId} project={p} {...actionsFor(p)} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectRow key={p.sessionId} project={p} {...actionsFor(p)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The first-run graphic: call → scoping → sent, drawn in the design language.
 *
 * Built from CSS + inline SVG rather than an illustration pack, for two reasons.
 * One is identity: a stock illustration is the fastest way to look like every
 * other template, and this audience shows our output to their clients. The other
 * is that it is theme- and direction-aware for free — it inherits the tokens, so
 * it recolours with the theme, and the connectors are drawn with a flex row that
 * mirrors itself in RTL. A PNG would need four exports and would still be wrong
 * in Arabic.
 *
 * `aria-hidden`: the three labels immediately below it say the same thing in
 * words, so announcing the graphic would just make a screen reader read the
 * workflow twice.
 */
function WorkflowGraphic() {
  const { t } = useTranslation('dashboard');
  const steps = [
    { icon: FileText, key: 'call' },
    { icon: ListChecks, key: 'scope' },
    { icon: Send, key: 'send' },
  ] as const;

  return (
    <div className="mb-4 flex items-center gap-2" aria-hidden>
      {steps.map(({ icon: Icon, key }, i) => (
        <div key={key} className="flex flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate text-micro font-medium text-muted-foreground">
              {t(`workflow.${key}`)}
            </span>
          </div>
          {/* The connector between steps, not after the last one. A dashed rule
              rather than an arrow glyph: it needs no RTL mirroring. */}
          {i < steps.length - 1 && (
            <span className="h-px w-4 shrink-0 border-t border-dashed border-border" />
          )}
        </div>
      ))}
    </div>
  );
}

/** A resolved starter idea (label + prefill values) the user can tap to fill the form. */
interface PickedStarter {
  idea: string;
  industry: string;
  scale: ProjectScale;
}

/**
 * Tappable concrete starter ideas above the idea box. Each fills the idea +
 * industry + scale (all still editable) so a first-time user never stares at a
 * blank textarea — the highest-leverage fix for sign-up→first-artifact drop-off.
 */
function StarterIdeas({ onPick }: { onPick: (starter: PickedStarter) => void }) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('starters.heading')}</p>
      <div className="flex flex-wrap gap-2">
        {STARTER_IDEAS.map(({ id, scale }) => (
          <button
            key={id}
            type="button"
            dir="auto"
            onClick={() =>
              onPick({
                idea: t(`starters.items.${id}.idea`),
                industry: t(`starters.items.${id}.industry`),
                scale,
              })
            }
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t(`starters.items.${id}.label`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A persistent entry point to the read-only Example project — a finished,
 * AI-generated design the user can explore before investing in the interview.
 * Sells the payoff up front and kills the empty-account feeling; it never
 * touches the backend or the plan quota.
 */
function ExampleBanner({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('dashboard');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 text-start transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Compass className="h-6 w-6 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          {t('example.banner.eyebrow')}
        </div>
        <div className="text-sm font-medium">{t('example.banner.title')}</div>
        <div className="text-xs text-muted-foreground">{t('example.banner.body')}</div>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary sm:flex">
        {t('example.banner.action')}
        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
      </span>
    </button>
  );
}

/** "Continue where you left off" — resumes the most recent project on its last tab. */
function ContinueBanner({
  project,
  busy,
  onOpen,
}: {
  project: ProjectOverview;
  busy: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-start transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
    >
      <PlayCircle className="h-6 w-6 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">
          {t('continue.title')}
        </div>
        <div className="truncate text-sm font-medium" dir="auto" title={displayName(project)}>
          {displayName(project)}
        </div>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary sm:flex">
        {t('continue.action')}
        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
      </span>
    </button>
  );
}

/**
 * How the owner seeds the interview: answer step by step, or paste the notes
 * from their client call. Notes-first isn't a separate flow — the notes become
 * the first transcript turn and the same interview runs, extracting slots from
 * them up front.
 */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'steps' | 'notes';
  onChange: (mode: 'steps' | 'notes') => void;
}) {
  const { t } = useTranslation('dashboard');
  const options: {
    value: 'steps' | 'notes';
    icon: typeof ListChecks;
    label: string;
  }[] = [
    { value: 'steps', icon: ListChecks, label: t('projects.modeSteps') },
    { value: 'notes', icon: FileText, label: t('projects.modeNotes') },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            mode === value
              ? 'border-primary bg-primary/10 font-medium text-foreground'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Segmented grid/list view switch. */
function ViewToggle({
  view,
  onChange,
}: {
  view: ProjectsView;
  onChange: (view: ProjectsView) => void;
}) {
  const { t } = useTranslation('dashboard');
  const options: { value: ProjectsView; icon: typeof LayoutGrid; label: string }[] = [
    { value: 'grid', icon: LayoutGrid, label: t('projects.gridView') },
    { value: 'list', icon: List, label: t('projects.listView') },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-border p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-label={label}
          aria-pressed={view === value}
          title={label}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

/**
 * A per-project kebab menu: Rename + Set client (both inline), Export
 * (JSON/Markdown/OpenAPI, for confirmed projects), and Delete. Rendered as a
 * sibling of the card's open button (never nested) so clicks don't open the
 * project. Self-manages open state + close-on-outside/Escape.
 */
function ProjectMenu({
  project,
  busy,
  onDelete,
  onRename,
  onSetClient,
  onExport,
}: { project: ProjectOverview } & Omit<CardActions, 'onOpen' | 'onCopyLink'>) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  /** Which label is being edited inline — both are one-line text, so one editor. */
  const [editing, setEditing] = useState<'title' | 'client' | null>(null);
  const [value, setValue] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setEditing(null);
  }

  function startEdit(field: 'title' | 'client') {
    setValue(
      field === 'title'
        ? (project.title ?? project.idea)
        : (project.clientName ?? ''),
    );
    setEditing(field);
  }

  function submitEdit() {
    const next = value.trim();
    const field = editing;
    close();
    if (field === 'title') {
      if (next !== (project.title ?? '')) onRename(next);
    } else if (field === 'client') {
      if (next !== (project.clientName ?? '')) onSetClient(next);
    }
  }

  const confirmed = project.status === 'confirmed';

  return (
    <div ref={rootRef} className="absolute end-2 top-2">
      <button
        type="button"
        disabled={busy}
        aria-label={t('actions.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-30 mt-1 w-52 rounded-md border border-border bg-card p-1 shadow-md"
        >
          {editing ? (
            <div className="p-1">
              <Input
                autoFocus
                dir="auto"
                value={value}
                maxLength={120}
                placeholder={
                  editing === 'client' ? t('projects.clientPlaceholder') : undefined
                }
                aria-label={
                  editing === 'title' ? t('actions.rename') : t('actions.setClient')
                }
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitEdit();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="h-8 text-sm"
              />
              <div className="mt-1.5 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setEditing(null)}
                >
                  {t('actions.cancel')}
                </Button>
                <Button size="sm" className="h-7 px-2" onClick={submitEdit}>
                  {t('actions.save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <MenuItem
                icon={Pencil}
                label={t('actions.rename')}
                onClick={() => startEdit('title')}
              />
              <MenuItem
                icon={Building2}
                label={
                  project.clientName
                    ? t('actions.changeClient')
                    : t('actions.setClient')
                }
                onClick={() => startEdit('client')}
              />
              {confirmed && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <MenuItem
                    icon={Download}
                    label={t('actions.exportJson')}
                    onClick={() => {
                      close();
                      onExport('json');
                    }}
                  />
                  <MenuItem
                    label={t('actions.exportMarkdown')}
                    onClick={() => {
                      close();
                      onExport('markdown');
                    }}
                  />
                  <MenuItem
                    label={t('actions.exportOpenapi')}
                    onClick={() => {
                      close();
                      onExport('openapi');
                    }}
                  />
                </>
              )}
              <div className="my-1 h-px bg-border" />
              <MenuItem
                icon={Trash2}
                label={t('projects.delete')}
                destructive
                onClick={() => {
                  close();
                  onDelete();
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon?: typeof Pencil;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The pipeline rail: one segment per stage, filled as its artifact appears.
 *
 * Derived from artifact *existence* (`projectProgress`), never from a stored
 * counter — the artifacts are the truth, and a version restore can rewind them.
 * A free-tier scoping legitimately stops at 4/6 (the API design and review are
 * Pro), so a partly-filled rail is a normal resting state, not a stalled one.
 */
function PipelineRail({ project }: { project: ProjectOverview }) {
  const { t } = useTranslation('dashboard');
  const progress = projectProgress(project.status, project.artifacts);
  const complete = progress.completed === progress.total;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-micro text-muted-foreground">
        <span>{t('pipeline.label')}</span>
        <span
          className={cn(
            'tabular-nums',
            // The one number that answers "is this deal ready to send?" from
            // across the room — so a finished pipeline states it in the accent
            // rather than making the owner count segments.
            complete && 'font-semibold text-primary',
          )}
          dir="ltr"
        >
          {t('pipeline.count', {
            done: progress.completed,
            total: progress.total,
          })}
        </span>
      </div>
      {/*
        `role="img"` + one label: a screen reader should hear "4 of 6", not six
        anonymous spans. The per-segment `title` is a sighted-hover affordance on
        top of that, not the accessible name.
      */}
      <div
        className="flex gap-1"
        role="img"
        aria-label={t('pipeline.count', {
          done: progress.completed,
          total: progress.total,
        })}
      >
        {progress.steps.map(({ step, done }) => (
          <span
            key={step}
            title={t(`pipeline.step.${step}`)}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-base ease-out',
              done ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** "Sent to client" — the card's headline fact once a link exists. */
function SentBadge() {
  const { t } = useTranslation('dashboard');
  return (
    // `default` is the success-toned pill in this Badge (green surface).
    <Badge variant="default" className="gap-1">
      <Send className="h-3 w-3" />
      {t('card.sent')}
    </Badge>
  );
}

/**
 * The client this scoping is for — the card's leading line.
 *
 * It sits ABOVE the project title on purpose. This is a deal board: the owner
 * scans it thinking "where is the Acme bid?", not "where is the clinic booking
 * system?". The title answers a question they only ask once they've found the
 * client. Absent until the owner names one, which is why the title still has to
 * stand on its own.
 */
function ClientLine({
  clientName,
  prominent = false,
}: {
  clientName: string;
  /** Card layout: the leading line. Row layout: a quiet line under the title. */
  prominent?: boolean;
}) {
  return (
    <p
      dir="auto"
      className={cn(
        'flex items-center gap-1.5 truncate',
        prominent
          ? 'text-xs font-semibold uppercase tracking-wide text-primary'
          : 'text-xs text-muted-foreground',
      )}
      title={clientName}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{clientName}</span>
    </p>
  );
}

/**
 * The card's primary action: put the link in the owner's clipboard.
 *
 * The three states come from `clientLinkState` — and `locked` is the one that
 * matters: the API mints only once the database design exists, so offering the
 * button earlier would hand the user a 409 they can do nothing about. It is
 * disabled with the reason, not hidden, so the path stays discoverable.
 */
function CopyLinkButton({
  state,
  busy,
  onCopyLink,
}: {
  state: ClientLinkState;
  busy: boolean;
  onCopyLink: () => Promise<boolean>;
}) {
  const { t } = useTranslation('dashboard');
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const locked = state === 'locked';

  async function copy() {
    setWorking(true);
    try {
      if (await onCopyLink()) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <Button
      /*
       * Outline, not accent-filled — even though this is the card's primary
       * action. A grid of twelve accent-filled buttons is twelve primary
       * actions, which is none: the page's single accent-filled button is "New
       * client scoping" in the header, and that is what makes it findable.
       * Position (alone in the footer) plus the accent TEXT on an unsent link is
       * enough to mark this as the thing to do next.
       */
      variant={state === 'sent' ? 'ghost' : 'outline'}
      size="sm"
      className={cn(
        'h-7 gap-1.5 px-2 text-xs transition-colors duration-fast ease-out',
        state === 'ready' &&
          'border-primary/40 text-primary hover:bg-primary-subtle hover:text-primary-subtle-foreground',
        state === 'sent' && 'text-muted-foreground',
        copied && 'text-success',
      )}
      disabled={locked || busy || working}
      // Locked says WHY (the link only mints once a database design exists), so
      // the disabled state teaches instead of stonewalling.
      title={locked ? t('card.copyLocked') : t('card.copyLink')}
      onClick={copy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      {copied ? t('card.copied') : t('card.copyLink')}
    </Button>
  );
}

/** A single scoping tile on the dashboard grid. */
function ProjectCard({
  project,
  busy,
  onOpen,
  onDelete,
  onRename,
  onSetClient,
  onCopyLink,
  onExport,
}: { project: ProjectOverview } & CardActions) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-card shadow-xs transition-[border-color,box-shadow] duration-fast ease-out hover:border-primary/60 hover:shadow-md focus-within:border-primary/60">
      {/* The open-button holds only the identity + progress. The actions below sit
          OUTSIDE it — nesting a button inside a button is invalid HTML, and a
          "copy link" click that also opened the project would be a trap. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex w-full flex-1 flex-col rounded-t-lg p-4 text-start disabled:pointer-events-none disabled:opacity-50"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 pe-8">
          <Badge variant={STATUS_VARIANT[project.status]}>
            {t(`status.${project.status}`)}
          </Badge>
          {project.shared && <SentBadge />}
        </div>
        {/* Client first, then the project name. See ClientLine: this is a deal
            board, and the owner scans it by client. */}
        {project.clientName && (
          <div className="mb-1">
            <ClientLine clientName={project.clientName} prominent />
          </div>
        )}
        <p
          dir="auto"
          className="line-clamp-2 text-h4 font-semibold"
          title={displayName(project)}
        >
          {displayName(project)}
        </p>
        <div className="mt-auto w-full pt-4">
          <PipelineRail project={project} />
          <p className="mt-2 text-micro text-muted-foreground">
            {t('projects.updated', {
              date: new Date(project.updatedAt).toLocaleDateString(),
            })}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2">
        <CopyLinkButton
          state={clientLinkState(project)}
          busy={busy}
          onCopyLink={onCopyLink}
        />
      </div>

      <ProjectMenu
        project={project}
        busy={busy}
        onDelete={onDelete}
        onRename={onRename}
        onSetClient={onSetClient}
        onExport={onExport}
      />
    </div>
  );
}

/** A single project as a compact list row (the list-view layout). */
function ProjectRow({
  project,
  busy,
  onOpen,
  onDelete,
  onRename,
  onSetClient,
  onCopyLink,
  onExport,
}: { project: ProjectOverview } & CardActions) {
  const { t } = useTranslation('dashboard');
  const progress = projectProgress(project.status, project.artifacts);
  return (
    <div className="group relative flex items-center gap-3 rounded-lg border border-border bg-card py-3 pe-12 ps-4 shadow-sm transition-all duration-150 hover:border-primary/60 hover:shadow-md focus-within:border-primary/60">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      >
        <Badge variant={STATUS_VARIANT[project.status]} className="shrink-0">
          {t(`status.${project.status}`)}
        </Badge>
        <span className="min-w-0 flex-1">
          <span
            dir="auto"
            className="block truncate text-sm font-medium"
            title={displayName(project)}
          >
            {displayName(project)}
          </span>
          {project.clientName && <ClientLine clientName={project.clientName} />}
        </span>
        {project.shared && (
          <span className="hidden shrink-0 sm:block">
            <SentBadge />
          </span>
        )}
        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          <Progress value={progress.percent} className="h-1.5 w-20" />
          <span className="w-9 text-end text-[11px] tabular-nums text-muted-foreground">
            {t('pipeline.count', {
              done: progress.completed,
              total: progress.total,
            })}
          </span>
        </span>
      </button>

      <CopyLinkButton
        state={clientLinkState(project)}
        busy={busy}
        onCopyLink={onCopyLink}
      />

      <ProjectMenu
        project={project}
        busy={busy}
        onDelete={onDelete}
        onRename={onRename}
        onSetClient={onSetClient}
        onExport={onExport}
      />
    </div>
  );
}
