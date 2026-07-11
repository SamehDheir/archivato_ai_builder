'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Compass,
  Download,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  PlayCircle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { InterviewStatus, ProjectScale, ProjectSummary } from '@archivato/shared';
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
const displayName = (p: ProjectSummary): string => p.title?.trim() || p.idea;

/** Shared props for the per-project actions. */
interface CardActions {
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
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
  onStart,
  onOpen,
  onDelete,
  onRename,
  onExport,
  onOpenExample,
}: {
  projects: ProjectSummary[];
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
  onStart: (e: React.FormEvent) => void;
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onExport: (sessionId: string, format: ExportFormat) => void;
  /** Open the read-only Example project (a finished sample, no quota impact). */
  onOpenExample: () => void;
}) {
  const { t } = useTranslation('dashboard');
  const showForm = creating || projects.length === 0;
  const [view, setView] = useState<ProjectsView>(readStoredView);

  const changeView = (next: ProjectsView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE, next);
    } catch {
      /* storage blocked */
    }
  };

  const actionsFor = (p: ProjectSummary): CardActions => ({
    busy,
    onOpen: () => onOpen(p.sessionId),
    onDelete: () => onDelete(p.sessionId),
    onRename: (title) => onRename(p.sessionId, title),
    onExport: (format) => onExport(p.sessionId, format),
  });

  // Most recently updated project (the list is server-sorted desc by updatedAt).
  const latest = projects[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('projects.heading')}</h2>
        <div className="flex items-center gap-2">
          {!showForm && projects.length > 0 && (
            <ViewToggle view={view} onChange={changeView} />
          )}
          {projects.length > 0 &&
            (creating ? (
              <Button variant="secondary" onClick={() => setCreating(false)}>
                {t('projects.back')}
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>{t('projects.new')}</Button>
            ))}
        </div>
      </div>

      <ExampleBanner onOpen={onOpenExample} />

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {projects.length === 0
                ? t('projects.startFirst')
                : t('projects.newTitle')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('projects.formHelp')}
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onStart}>
              <StarterIdeas
                onPick={(next) => {
                  setIdea(next.idea);
                  setIndustry(next.industry);
                  setScale(next.scale);
                }}
              />
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
  project: ProjectSummary;
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
 * A per-project kebab menu: Rename (inline), Export (JSON/Markdown/OpenAPI, for
 * confirmed projects), and Delete. Rendered as a sibling of the card's open
 * button (never nested) so clicks don't open the project. Self-manages open
 * state + close-on-outside/Escape.
 */
function ProjectMenu({
  project,
  busy,
  onDelete,
  onRename,
  onExport,
}: { project: ProjectSummary } & Omit<CardActions, 'onOpen'>) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
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
    setRenaming(false);
  }

  function startRename() {
    setValue(project.title ?? project.idea);
    setRenaming(true);
  }

  function submitRename() {
    const next = value.trim();
    close();
    if (next !== (project.title ?? '')) onRename(next);
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
          {renaming ? (
            <div className="p-1">
              <Input
                autoFocus
                dir="auto"
                value={value}
                maxLength={120}
                aria-label={t('actions.rename')}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                className="h-8 text-sm"
              />
              <div className="mt-1.5 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setRenaming(false)}
                >
                  {t('actions.cancel')}
                </Button>
                <Button size="sm" className="h-7 px-2" onClick={submitRename}>
                  {t('actions.save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <MenuItem icon={Pencil} label={t('actions.rename')} onClick={startRename} />
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

/** A single project tile on the dashboard grid. */
function ProjectCard({
  project,
  busy,
  onOpen,
  onDelete,
  onRename,
  onExport,
}: { project: ProjectSummary } & CardActions) {
  const { t } = useTranslation('dashboard');
  const pct = Math.round(project.completeness * 100);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex w-full flex-col rounded-lg border border-border bg-card p-4 text-start shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      >
        <div className="mb-2 flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[project.status]}>
            {t(`status.${project.status}`)}
          </Badge>
        </div>
        <p
          dir="auto"
          className="line-clamp-2 pe-8 text-sm font-semibold"
          title={displayName(project)}
        >
          {displayName(project)}
        </p>
        <div className="mt-auto pt-3">
          {project.status !== 'confirmed' && (
            <>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{t('projects.completeness')}</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('projects.updated', {
              date: new Date(project.updatedAt).toLocaleDateString(),
            })}
          </p>
        </div>
      </button>
      <ProjectMenu
        project={project}
        busy={busy}
        onDelete={onDelete}
        onRename={onRename}
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
  onExport,
}: { project: ProjectSummary } & CardActions) {
  const { t } = useTranslation('dashboard');
  const pct = Math.round(project.completeness * 100);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card py-3 pe-12 ps-4 text-start shadow-sm transition-all duration-150 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      >
        <Badge variant={STATUS_VARIANT[project.status]} className="shrink-0">
          {t(`status.${project.status}`)}
        </Badge>
        <span
          dir="auto"
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={displayName(project)}
        >
          {displayName(project)}
        </span>
        {project.status !== 'confirmed' && (
          <span className="hidden shrink-0 items-center gap-2 sm:flex">
            <Progress value={pct} className="h-1.5 w-20" />
            <span className="w-9 text-end text-[11px] tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </span>
        )}
        <span className="hidden shrink-0 whitespace-nowrap text-[11px] text-muted-foreground md:inline">
          {t('projects.updated', {
            date: new Date(project.updatedAt).toLocaleDateString(),
          })}
        </span>
      </button>
      <ProjectMenu
        project={project}
        busy={busy}
        onDelete={onDelete}
        onRename={onRename}
        onExport={onExport}
      />
    </div>
  );
}
