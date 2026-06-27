'use client';

import { useState } from 'react';
import type {
  InterviewState,
  ProjectScale,
  RequirementsSummary,
} from '@archivato/shared';
import { interviewApi } from '../lib/api';

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

  function reset() {
    setState(null);
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
              <p className="subtitle" style={{ marginTop: 12 }}>
                The pipeline can now proceed to System Design (next slice).
              </p>
              {state.summary && <SummaryView summary={state.summary} />}
              <button className="secondary" onClick={reset}>
                Start a new interview
              </button>
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
