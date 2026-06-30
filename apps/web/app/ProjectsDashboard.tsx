'use client';

import { ArrowRight } from 'lucide-react';
import type { InterviewStatus, ProjectScale, ProjectSummary } from '@archivato/shared';
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

const STATUS_META: Record<
  InterviewStatus,
  { label: string; variant: 'secondary' | 'warning' | 'primary' }
> = {
  collecting: { label: 'Interviewing', variant: 'secondary' },
  awaiting_confirmation: { label: 'Review & confirm', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'primary' },
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
}) {
  const showForm = creating || projects.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        {projects.length > 0 &&
          (creating ? (
            <Button variant="secondary" onClick={() => setCreating(false)}>
              ← Back to projects
            </Button>
          ) : (
            <Button onClick={() => setCreating(true)}>+ New project</Button>
          ))}
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {projects.length === 0 ? 'Start your first project' : 'New project'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onStart}>
              <div className="space-y-1.5">
                <Label htmlFor="idea">Project idea</Label>
                <Textarea
                  id="idea"
                  placeholder="e.g. A clinic management system with appointments, billing, doctors, and patient records."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="industry">Industry (optional)</Label>
                  <Input
                    id="industry"
                    placeholder="healthcare"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scale">Scale (optional)</Label>
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
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={busy || idea.trim().length < 10}>
                {busy ? 'Starting…' : 'Start interview'}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.sessionId}
              project={p}
              busy={busy}
              onOpen={() => onOpen(p.sessionId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single project tile on the dashboard grid. */
function ProjectCard({
  project,
  busy,
  onOpen,
}: {
  project: ProjectSummary;
  busy: boolean;
  onOpen: () => void;
}) {
  const status = STATUS_META[project.status];
  const pct = Math.round(project.completeness * 100);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="group flex flex-col rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 disabled:opacity-50"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className="line-clamp-2 text-sm font-semibold" title={project.idea}>
        {project.idea}
      </p>
      <div className="mt-auto pt-3">
        {project.status !== 'confirmed' && (
          <>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Completeness</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Updated {new Date(project.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </button>
  );
}
