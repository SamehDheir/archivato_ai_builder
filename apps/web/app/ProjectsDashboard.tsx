'use client';

import type { ProjectScale, ProjectSummary } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const SCALES: ProjectScale[] = ['mvp', 'startup', 'enterprise'];

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
        <Card>
          <CardContent className="p-2">
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li
                  key={p.sessionId}
                  className="flex items-center justify-between gap-3 px-2 py-3"
                >
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                    onClick={() => onOpen(p.sessionId)}
                    disabled={busy}
                    title={p.idea}
                  >
                    {p.idea}
                  </button>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Badge variant="secondary">
                      {p.status.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(p.completeness * 100)}% ·{' '}
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
