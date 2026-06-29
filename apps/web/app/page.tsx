'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type {
  ApiDesign,
  DatabaseDesign,
  InterviewState,
  JobStatus,
  PipelineStageName,
  ProjectScale,
  ProjectSummary,
  RefineResult,
  RequirementDocument,
  RequirementsSummary,
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
import { RequirementDocumentView } from './RequirementDocumentView';
import { SystemDesignView } from './SystemDesignView';
import { DatabaseDesignView } from './DatabaseDesignView';
import { ApiDesignView } from './ApiDesignView';
import { ReviewView } from './ReviewView';
import { ExportView } from './ExportView';
import { ChatPanel } from './ChatPanel';

const SCALES: ProjectScale[] = ['mvp', 'startup', 'enterprise'];

const STAGE_LABEL: Record<PipelineStageName, string> = {
  requirements: 'requirement document',
  'system-design': 'system design',
  'database-design': 'database design',
  'api-design': 'API design',
  review: 'AI review',
};

/** localStorage key for the active session id, scoped PER USER. */
const sessionKey = (userId: string) => `archivato.sessionId:${userId}`;
const LEGACY_SESSION_KEY = 'archivato.sessionId';

type ActiveJob = { stage: PipelineStageName; progress: number };

export default function Home() {
  const [state, setState] = useState<InterviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  // Start form
  const [idea, setIdea] = useState('');
  const [industry, setIndustry] = useState('');
  const [scale, setScale] = useState<ProjectScale | ''>('');

  // Answer box
  const [answer, setAnswer] = useState('');

  // Generated artifacts
  const [doc, setDoc] = useState<RequirementDocument | null>(null);
  const [design, setDesign] = useState<SystemDesign | null>(null);
  const [dbDesign, setDbDesign] = useState<DatabaseDesign | null>(null);
  const [apiDesign, setApiDesign] = useState<ApiDesign | null>(null);
  const [review, setReview] = useState<ReviewReport | null>(null);

  // The async generation job currently running (drives the progress bar).
  const [job, setJob] = useState<ActiveJob | null>(null);

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
    let cancelled = false;
    (async () => {
      let uid: string | null = null;
      try {
        const me = await authApi.me();
        if (cancelled || !me) {
          if (!cancelled) setRestoring(false);
          return;
        }
        uid = me.id;
        setUserId(uid);

        interviewApi
          .list()
          .then((list) => !cancelled && setProjects(list))
          .catch(() => undefined);

        const saved = localStorage.getItem(sessionKey(uid));
        if (!saved) {
          setRestoring(false);
          return;
        }
        await loadSession(saved);
      } catch {
        if (uid) localStorage.removeItem(sessionKey(uid));
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
      void refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setJob(null);
    }
  }

  async function openProject(sessionId: string) {
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
      void refreshProjects();
    }
  }

  async function handleAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!state || !answer.trim()) return;
    const next = await run(() =>
      interviewApi.answer(state.sessionId, answer.trim()),
    );
    if (next) {
      setState(next);
      setAnswer('');
    }
  }

  async function handleConfirm() {
    if (!state) return;
    const next = await run(() => interviewApi.confirm(state.sessionId));
    if (next) setState(next);
  }

  const handleGenerate = () =>
    generateStage<RequirementDocument>('requirements', setDoc);
  const handleGenerateDesign = () =>
    generateStage<SystemDesign>('system-design', setDesign);
  const handleGenerateDbDesign = () =>
    generateStage<DatabaseDesign>('database-design', setDbDesign);
  const handleGenerateApiDesign = () =>
    generateStage<ApiDesign>('api-design', setApiDesign);
  const handleGenerateReview = () =>
    generateStage<ReviewReport>('review', setReview);

  function handleRefined(result: RefineResult) {
    setDoc(result.requirementDocument);
    setDesign(result.systemDesign);
    setDbDesign(result.databaseDesign);
    setApiDesign(result.apiDesign);
    if (result.reviewReport) setReview(result.reviewReport);
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
    setAnswer('');
    setError(null);
  }

  if (restoring) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm">Restoring your session…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-bold">Archivato AI Builder</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        AI Software Architecture Generator — turn an idea into a full system
        design.
      </p>

      {!state && projects.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>My projects</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li
                  key={p.sessionId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                    onClick={() => openProject(p.sessionId)}
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

      {!state && (
        <Card>
          <CardHeader>
            <CardTitle>Describe your idea</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleStart}>
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
      )}

      {state && (
        <div className="space-y-4">
          <ProgressPanel state={state} />

          {state.history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Conversation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.history.map((ex, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <Badge variant="secondary" className="mb-1">
                        {ex.question.phase}
                      </Badge>
                      <div>{ex.question.prompt}</div>
                    </div>
                    <div className="ml-auto max-w-[85%] rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                      {ex.answer}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {state.status === 'collecting' && state.currentQuestion && (
            <Card>
              <CardContent className="p-5">
                <form className="space-y-3" onSubmit={handleAnswer}>
                  <Badge variant="secondary">
                    {state.currentQuestion.phase}
                  </Badge>
                  <h3 className="text-base font-semibold">
                    {state.currentQuestion.prompt}
                  </h3>
                  <Textarea
                    placeholder="Type your answer…"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit" disabled={busy || !answer.trim()}>
                    {busy ? 'Sending…' : 'Answer'}
                  </Button>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </form>
              </CardContent>
            </Card>
          )}

          {state.status === 'awaiting_confirmation' && state.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Requirements summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Completeness reached the threshold. Review and confirm to lock
                  the requirements before design begins.
                </p>
                <SummaryView summary={state.summary} />
                <div className="mt-4 flex gap-2">
                  <Button variant="success" onClick={handleConfirm} disabled={busy}>
                    {busy ? 'Confirming…' : 'Confirm requirements'}
                  </Button>
                  <Button variant="secondary" onClick={reset} disabled={busy}>
                    Start over
                  </Button>
                </div>
                {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>
          )}

          {state.status === 'confirmed' && (
            <Card>
              <CardContent className="p-5">
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Requirements confirmed
                </Badge>

                {job && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Generating {STAGE_LABEL[job.stage]}…</span>
                      <span>{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} />
                  </div>
                )}

                {!doc && (
                  <>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Generate the formal Requirement Document from this
                      interview.
                    </p>
                    {state.summary && (
                      <div className="mt-3">
                        <SummaryView summary={state.summary} />
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Button onClick={handleGenerate} disabled={busy}>
                        {busy ? 'Generating…' : 'Generate Requirement Document'}
                      </Button>
                      <Button variant="secondary" onClick={reset} disabled={busy}>
                        Start over
                      </Button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm text-destructive">{error}</p>
                    )}
                  </>
                )}

                {doc && (
                  <>
                    <h3 className="mt-4 text-base font-semibold">
                      Requirement Document
                    </h3>
                    <RequirementDocumentView doc={doc} />

                    {!design && (
                      <>
                        <p className="mt-4 text-sm text-muted-foreground">
                          Next: design the system architecture from these
                          requirements.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button onClick={handleGenerateDesign} disabled={busy}>
                            {busy ? 'Designing…' : 'Generate System Design'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={handleGenerate}
                            disabled={busy}
                          >
                            Regenerate requirements
                          </Button>
                        </div>
                      </>
                    )}

                    {design && (
                      <>
                        <h3 className="mt-5 text-base font-semibold">
                          System Design
                        </h3>
                        <SystemDesignView design={design} />

                        {!dbDesign && (
                          <>
                            <p className="mt-4 text-sm text-muted-foreground">
                              Next: design the database schema from the services
                              and roles.
                            </p>
                            <div className="mt-3 flex gap-2">
                              <Button
                                onClick={handleGenerateDbDesign}
                                disabled={busy}
                              >
                                {busy ? 'Designing…' : 'Generate Database Design'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={handleGenerateDesign}
                                disabled={busy}
                              >
                                Regenerate system design
                              </Button>
                            </div>
                          </>
                        )}

                        {dbDesign && (
                          <>
                            <h3 className="mt-5 text-base font-semibold">
                              Database Design
                            </h3>
                            <DatabaseDesignView design={dbDesign} />

                            {!apiDesign && (
                              <>
                                <p className="mt-4 text-sm text-muted-foreground">
                                  Next: design the REST API from the entities and
                                  services.
                                </p>
                                <div className="mt-3 flex gap-2">
                                  <Button
                                    onClick={handleGenerateApiDesign}
                                    disabled={busy}
                                  >
                                    {busy ? 'Designing…' : 'Generate API Design'}
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={handleGenerateDbDesign}
                                    disabled={busy}
                                  >
                                    Regenerate schema
                                  </Button>
                                </div>
                              </>
                            )}

                            {apiDesign && (
                              <>
                                <h3 className="mt-5 text-base font-semibold">
                                  API Design
                                </h3>
                                <ApiDesignView design={apiDesign} />

                                <h3 className="mt-5 text-base font-semibold">
                                  Refine with AI
                                </h3>
                                <ChatPanel
                                  sessionId={state.sessionId}
                                  onRefined={handleRefined}
                                />

                                {!review && (
                                  <>
                                    <p className="mt-4 text-sm text-muted-foreground">
                                      Finally: run the AI review of the whole
                                      system.
                                    </p>
                                    <div className="mt-3 flex gap-2">
                                      <Button
                                        onClick={handleGenerateReview}
                                        disabled={busy}
                                      >
                                        {busy ? 'Reviewing…' : 'Run AI Review'}
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        onClick={handleGenerateApiDesign}
                                        disabled={busy}
                                      >
                                        Regenerate API
                                      </Button>
                                    </div>
                                  </>
                                )}

                                {review && (
                                  <>
                                    <h3 className="mt-5 text-base font-semibold">
                                      AI Review
                                    </h3>
                                    <ReviewView report={review} />

                                    <h3 className="mt-5 text-base font-semibold">
                                      Export
                                    </h3>
                                    <ExportView sessionId={state.sessionId} />

                                    <div className="mt-4 flex gap-2">
                                      <Button
                                        variant="secondary"
                                        onClick={handleGenerateReview}
                                        disabled={busy}
                                      >
                                        {busy ? 'Regenerating…' : 'Regenerate review'}
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        onClick={reset}
                                        disabled={busy}
                                      >
                                        Start a new interview
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                    {error && (
                      <p className="mt-2 text-sm text-destructive">{error}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressPanel({ state }: { state: InterviewState }) {
  const pct = Math.round(state.completeness * 100);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1.5 flex justify-between text-sm">
          <span>Requirement completeness</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Status: {state.status.replace(/_/g, ' ')}</span>
          {state.phase && <span>Phase: {state.phase.replace(/_/g, ' ')}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryView({ summary }: { summary: RequirementsSummary }) {
  const sections: [string, string[] | string][] = [
    ['Goal', summary.goal],
    ['Users', summary.users],
    ['Features', summary.features],
    ['Business rules', summary.businessRules],
    ['Constraints', summary.constraints],
    ['Assumptions', summary.assumptions],
  ];
  return (
    <div className="space-y-3">
      {sections.map(([heading, value]) => (
        <div key={heading}>
          <h4 className="mb-1 text-sm font-semibold">{heading}</h4>
          {Array.isArray(value) ? (
            value.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {value.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )
          ) : (
            <div className="text-sm">{value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
