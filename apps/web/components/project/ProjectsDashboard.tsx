'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, LayoutGrid, List, Sparkles, Trash2 } from 'lucide-react';
import type { InterviewStatus, ProjectScale, ProjectSummary } from '@archivato/shared';
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
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.sessionId}
              project={p}
              busy={busy}
              onOpen={() => onOpen(p.sessionId)}
              onDelete={() => onDelete(p.sessionId)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <ProjectRow
              key={p.sessionId}
              project={p}
              busy={busy}
              onOpen={() => onOpen(p.sessionId)}
              onDelete={() => onDelete(p.sessionId)}
            />
          ))}
        </div>
      )}
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

/** A single project tile on the dashboard grid. */
function ProjectCard({
  project,
  busy,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge variant={STATUS_VARIANT[project.status]}>
            {t(`status.${project.status}`)}
          </Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground rtl:-scale-x-100" />
        </div>
        <p
          dir="auto"
          className="line-clamp-2 pe-6 text-sm font-semibold"
          title={project.idea}
        >
          {project.idea}
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
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={t('projects.delete')}
        title={t('projects.delete')}
        className="absolute bottom-3 end-3 rounded-md bg-card p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:pointer-events-none"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** A single project as a compact list row (the list-view layout). */
function ProjectRow({
  project,
  busy,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('dashboard');
  const pct = Math.round(project.completeness * 100);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-start shadow-sm transition-all duration-150 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      >
        <Badge variant={STATUS_VARIANT[project.status]} className="shrink-0">
          {t(`status.${project.status}`)}
        </Badge>
        <span
          dir="auto"
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={project.idea}
        >
          {project.idea}
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
        <ArrowRight className="me-8 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground rtl:-scale-x-100" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={t('projects.delete')}
        title={t('projects.delete')}
        className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md bg-card p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:pointer-events-none"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
