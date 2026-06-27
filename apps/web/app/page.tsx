'use client';

import { useState } from 'react';
import type {
  DatabaseDesign,
  InterviewState,
  ProjectScale,
  RequirementDocument,
  RequirementsSummary,
  SystemDesign,
} from '@archivato/shared';
import {
  databaseDesignApi,
  interviewApi,
  requirementsApi,
  systemDesignApi,
} from '../lib/api';
import { RequirementDocumentView } from './RequirementDocumentView';
import { SystemDesignView } from './SystemDesignView';
import { DatabaseDesignView } from './DatabaseDesignView';

const SCALES: ProjectScale[] = ['mvp', 'startup', 'enterprise'];

export default function Home() {
  const [state, setState] = useState<InterviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start form
  const [idea, setIdea] = useState('');
  const [industry, setIndustry] = useState('');
  const [scale, setScale] = useState<ProjectScale | ''>('');

  // Answer box
  const [answer, setAnswer] = useState('');

  // Requirement document (Slice 3)
  const [doc, setDoc] = useState<RequirementDocument | null>(null);

  // System design (Slice 4)
  const [design, setDesign] = useState<SystemDesign | null>(null);

  // Database design (Slice 5)
  const [dbDesign, setDbDesign] = useState<DatabaseDesign | null>(null);

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

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const next = await run(() =>
      interviewApi.start({
        idea,
        industry: industry || undefined,
        scale: scale || undefined,
      }),
    );
    if (next) setState(next);
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

  async function handleGenerate() {
    if (!state) return;
    const generated = await run(() =>
      requirementsApi.generate(state.sessionId),
    );
    if (generated) setDoc(generated);
  }

  async function handleGenerateDesign() {
    if (!state) return;
    const generated = await run(() =>
      systemDesignApi.generate(state.sessionId),
    );
    if (generated) setDesign(generated);
  }

  async function handleGenerateDbDesign() {
    if (!state) return;
    const generated = await run(() =>
      databaseDesignApi.generate(state.sessionId),
    );
    if (generated) setDbDesign(generated);
  }

  function reset() {
    setState(null);
    setDoc(null);
    setDesign(null);
    setDbDesign(null);
    setIdea('');
    setIndustry('');
    setScale('');
    setAnswer('');
    setError(null);
  }

  return (
    <div className="container">
      <h1 className="title">Archivato AI Builder</h1>
      <p className="subtitle">
        AI Software Architecture Generator — Step 2: the requirements interview.
      </p>

      {!state && (
        <form className="panel" onSubmit={handleStart}>
          <h3>Describe your idea</h3>
          <label htmlFor="idea">Project idea</label>
          <textarea
            id="idea"
            placeholder="e.g. A clinic management system with appointments, billing, doctors, and patient records."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            required
          />
          <div className="row">
            <div>
              <label htmlFor="industry">Industry (optional)</label>
              <input
                id="industry"
                placeholder="healthcare"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="scale">Scale (optional)</label>
              <select
                id="scale"
                value={scale}
                onChange={(e) => setScale(e.target.value as ProjectScale | '')}
              >
                <option value="">—</option>
                {SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy || idea.trim().length < 10}>
            {busy ? 'Starting…' : 'Start interview'}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      )}

      {state && (
        <>
          <ProgressPanel state={state} />

          {state.history.length > 0 && (
            <div className="panel">
              <h3>Conversation</h3>
              {state.history.map((ex, i) => (
                <div key={i}>
                  <div className="bubble q">
                    <span className="phase-tag">{ex.question.phase}</span>
                    <div>{ex.question.prompt}</div>
                  </div>
                  <div className="bubble a">{ex.answer}</div>
                </div>
              ))}
            </div>
          )}

          {state.status === 'collecting' && state.currentQuestion && (
            <form className="panel" onSubmit={handleAnswer}>
              <span className="phase-tag">{state.currentQuestion.phase}</span>
              <h3>{state.currentQuestion.prompt}</h3>
              <textarea
                placeholder="Type your answer…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={busy || !answer.trim()}>
                {busy ? 'Sending…' : 'Answer'}
              </button>
              {error && <div className="error">{error}</div>}
            </form>
          )}

          {state.status === 'awaiting_confirmation' && state.summary && (
            <div className="panel">
              <h3>Requirements summary</h3>
              <p className="subtitle">
                Completeness reached the threshold. Review and confirm to lock
                the requirements before design begins.
              </p>
              <SummaryView summary={state.summary} />
              <div className="row">
                <button
                  className="success"
                  onClick={handleConfirm}
                  disabled={busy}
                >
                  {busy ? 'Confirming…' : 'Confirm requirements'}
                </button>
                <button className="secondary" onClick={reset} disabled={busy}>
                  Start over
                </button>
              </div>
              {error && <div className="error">{error}</div>}
            </div>
          )}

          {state.status === 'confirmed' && (
            <div className="panel">
              <span className="badge">✓ Requirements confirmed</span>
              {!doc && (
                <>
                  <p className="subtitle" style={{ marginTop: 12 }}>
                    Generate the formal Requirement Document from this interview.
                  </p>
                  {state.summary && <SummaryView summary={state.summary} />}
                  <div className="row">
                    <button onClick={handleGenerate} disabled={busy}>
                      {busy ? 'Generating…' : 'Generate Requirement Document'}
                    </button>
                    <button
                      className="secondary"
                      onClick={reset}
                      disabled={busy}
                    >
                      Start over
                    </button>
                  </div>
                  {error && <div className="error">{error}</div>}
                </>
              )}

              {doc && (
                <>
                  <h3 style={{ marginTop: 12 }}>Requirement Document</h3>
                  <RequirementDocumentView doc={doc} />

                  {!design && (
                    <>
                      <p className="subtitle" style={{ marginTop: 16 }}>
                        Next: design the system architecture from these
                        requirements.
                      </p>
                      <div className="row">
                        <button onClick={handleGenerateDesign} disabled={busy}>
                          {busy ? 'Designing…' : 'Generate System Design'}
                        </button>
                        <button
                          className="secondary"
                          onClick={handleGenerate}
                          disabled={busy}
                        >
                          Regenerate requirements
                        </button>
                      </div>
                    </>
                  )}

                  {design && (
                    <>
                      <h3 style={{ marginTop: 20 }}>System Design</h3>
                      <SystemDesignView design={design} />

                      {!dbDesign && (
                        <>
                          <p className="subtitle" style={{ marginTop: 16 }}>
                            Next: design the database schema from the services
                            and roles.
                          </p>
                          <div className="row">
                            <button
                              onClick={handleGenerateDbDesign}
                              disabled={busy}
                            >
                              {busy ? 'Designing…' : 'Generate Database Design'}
                            </button>
                            <button
                              className="secondary"
                              onClick={handleGenerateDesign}
                              disabled={busy}
                            >
                              Regenerate system design
                            </button>
                          </div>
                        </>
                      )}

                      {dbDesign && (
                        <>
                          <h3 style={{ marginTop: 20 }}>Database Design</h3>
                          <DatabaseDesignView design={dbDesign} />
                          <p className="subtitle" style={{ marginTop: 16 }}>
                            The pipeline can now proceed to API Design (next
                            slice).
                          </p>
                          <div className="row">
                            <button
                              className="secondary"
                              onClick={handleGenerateDbDesign}
                              disabled={busy}
                            >
                              {busy ? 'Regenerating…' : 'Regenerate schema'}
                            </button>
                            <button
                              className="secondary"
                              onClick={reset}
                              disabled={busy}
                            >
                              Start a new interview
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {error && <div className="error">{error}</div>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgressPanel({ state }: { state: InterviewState }) {
  const pct = Math.round(state.completeness * 100);
  return (
    <div className="panel">
      <div className="meta">
        <span>Requirement completeness</span>
        <span>{pct}%</span>
      </div>
      <div className="progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="meta">
        <span>Status: {state.status.replace(/_/g, ' ')}</span>
        {state.phase && <span>Phase: {state.phase.replace(/_/g, ' ')}</span>}
      </div>
    </div>
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
    <>
      {sections.map(([heading, value]) => (
        <div className="summary-section" key={heading}>
          <h4>{heading}</h4>
          {Array.isArray(value) ? (
            value.length ? (
              <ul className="clean">
                {value.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : (
              <span className="subtitle">—</span>
            )
          ) : (
            <div>{value}</div>
          )}
        </div>
      ))}
    </>
  );
}
