import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { COMPLETENESS_THRESHOLD, type IntentAnalysis } from '@archivato/shared';
import { InterviewService } from './interview.service';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { BillingService } from '../billing/billing.service';
import { TOTAL_QUESTIONS } from './question-plan';

// These tests drive the state machine with owner-less sessions (userId = null),
// so the confirm gate never calls billing — a no-op stub satisfies the type.
const billingStub = {
  getProjectQuota: async () => 999,
} as unknown as BillingService;

function makeService(mock = new MockLlmProvider()): InterviewService {
  const repo = new InMemoryInterviewSessionRepository();
  const analyst = new ProductAnalystAgent(mock);
  return new InterviewService(
    repo,
    analyst,
    new InterviewerAgent(mock),
    billingStub,
  );
}

const IDEA = { idea: 'A clinic management system with appointments and billing' };

async function answerAll(svc: InterviewService, sessionId: string) {
  // Answer until the gate closes collecting.
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await svc.getState(sessionId);
    if (state.status !== 'collecting') break;
    await svc.answer(sessionId, `answer-${i}`);
  }
}

describe('InterviewService', () => {
  it('starts collecting and asks the first Understanding question', async () => {
    const svc = makeService();
    const state = await svc.start(IDEA);

    expect(state.status).toBe('collecting');
    expect(state.completeness).toBe(0);
    expect(state.currentQuestion?.id).toBe('a1');
    expect(state.phase).toBe('understanding');
    expect(state.summary).toBeNull();
  });

  it('uses a deterministic fallback intent when the provider echoes', async () => {
    const svc = makeService(); // default mock echoes -> invalid IntentAnalysis
    const state = await svc.start(IDEA);
    expect(state.intent?.summary).toBe(IDEA.idea);
  });

  it('uses the agent intent when the provider returns valid analysis', async () => {
    const mock = new MockLlmProvider();
    const intent: IntentAnalysis = {
      summary: 'Clinic management platform',
      domain: 'healthcare',
      primaryUsers: ['doctors', 'patients'],
      coreCapabilities: ['appointments', 'billing'],
      openQuestions: [],
    };
    mock.enqueueJson(intent);

    const svc = makeService(mock);
    const state = await svc.start(IDEA);
    expect(state.intent).toEqual(intent);
  });

  it('advances through questions and tracks completeness', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);

    const afterOne = await svc.answer(sessionId, 'manage a clinic');
    expect(afterOne.history).toHaveLength(1);
    expect(afterOne.currentQuestion?.id).toBe('a2');
    expect(afterOne.completeness).toBeGreaterThan(0);
  });

  it('reaches the gate, summarizes, and awaits confirmation', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);
    await answerAll(svc, sessionId);

    const state = await svc.getState(sessionId);
    expect(state.status).toBe('awaiting_confirmation');
    expect(state.completeness).toBeGreaterThanOrEqual(COMPLETENESS_THRESHOLD);
    expect(state.currentQuestion).toBeNull();
    expect(state.summary).not.toBeNull();
    expect(state.summary?.goal).toBeTruthy();
  });

  it('rejects answering once the gate is reached', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);
    await answerAll(svc, sessionId);

    await expect(svc.answer(sessionId, 'late answer')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('confirms only from the awaiting_confirmation state', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);

    await expect(svc.confirm(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await answerAll(svc, sessionId);
    const confirmed = await svc.confirm(sessionId);
    expect(confirmed.status).toBe('confirmed');
  });

  it('throws NotFound for an unknown session', async () => {
    const svc = makeService();
    await expect(svc.getState('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ── ownership / "my projects" ─────────────────────────────────────────────

  it('stamps the owner on start and lists only that user\'s projects', async () => {
    const svc = makeService();
    await svc.start(IDEA, 'user-1');
    await svc.start({ idea: 'A second unrelated project idea' }, 'user-1');
    await svc.start({ idea: 'Someone else entirely owns this one' }, 'user-2');

    const mine = await svc.list('user-1');
    expect(mine).toHaveLength(2);
    expect(mine.every((p) => typeof p.sessionId === 'string')).toBe(true);
    expect(mine[0]).toHaveProperty('status', 'collecting');

    const theirs = await svc.list('user-2');
    expect(theirs).toHaveLength(1);

    expect(await svc.list('nobody')).toEqual([]);
  });

  it('enforces the project-count quota at start (402 past the limit)', async () => {
    const mock = new MockLlmProvider();
    const repo = new InMemoryInterviewSessionRepository();
    // Stub a plan that allows exactly 1 project.
    const billing = { getProjectQuota: async () => 1 } as unknown as BillingService;
    const svc = new InterviewService(
      repo,
      new ProductAnalystAgent(mock),
      new InterviewerAgent(mock),
      billing,
    );
    await svc.start(IDEA, 'user-1');
    await expect(
      svc.start({ idea: 'A second project over the limit' }, 'user-1'),
    ).rejects.toBeInstanceOf(HttpException);
    // A different user is unaffected.
    await expect(svc.start(IDEA, 'user-2')).resolves.toBeDefined();
  });

  it('deletes a project (frees a quota slot)', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA, 'user-1');
    await svc.deleteProject(sessionId);
    await expect(svc.getState(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await svc.list('user-1')).toHaveLength(0);
  });

  // ── adaptive interview (real-AI path, scripted via the mock) ──────────────

  /** A mock that answers the interviewer with scripted, adaptive decisions. */
  function adaptiveMock(): MockLlmProvider {
    const mock = new MockLlmProvider();
    let turn = 0;
    mock.setResponder((messages) => {
      const text = messages.map((m) => m.content).join('\n');
      // The interviewer prompt asks for the "NEXT question"; everything else
      // (intent analysis) just echoes and uses its deterministic fallback.
      if (!text.includes('NEXT question')) {
        return JSON.stringify({ provider: 'mock', echo: 'intent' });
      }
      turn += 1;
      // Finish once at least 4 questions have been answered (turn 5).
      if (turn >= 5) {
        return JSON.stringify({ done: true, coverage: 0.95 });
      }
      return JSON.stringify({
        done: false,
        coverage: 0.2 * turn,
        phase: 'features',
        question: `Adaptive question ${turn}?`,
      });
    });
    return mock;
  }

  it('asks AI-generated questions when the interview provider conforms', async () => {
    const svc = makeService(adaptiveMock());
    const state = await svc.start(IDEA);

    expect(state.currentQuestion?.id).toBe('q1');
    expect(state.currentQuestion?.prompt).toBe('Adaptive question 1?');
    expect(state.currentQuestion?.phase).toBe('features');
    // Coverage reflects the model's estimate, not a fixed plan ratio.
    expect(state.completeness).toBeCloseTo(0.2);
  });

  it('closes the gate when the AI signals it has enough', async () => {
    const svc = makeService(adaptiveMock());
    const { sessionId } = await svc.start(IDEA);

    // Answer the 4 adaptive questions; the 5th decision is done=true.
    for (let i = 0; i < 6; i++) {
      const s = await svc.getState(sessionId);
      if (s.status !== 'collecting') break;
      await svc.answer(sessionId, `answer ${i}`);
    }

    const state = await svc.getState(sessionId);
    expect(state.status).toBe('awaiting_confirmation');
    expect(state.history).toHaveLength(4);
    expect(state.completeness).toBeGreaterThanOrEqual(COMPLETENESS_THRESHOLD);
    expect(state.currentQuestion).toBeNull();
    expect(state.summary).not.toBeNull();
  });

  it('falls back to the fixed plan when the provider is non-conforming', async () => {
    const svc = makeService(); // default echo → invalid decision → plan
    const state = await svc.start(IDEA);
    expect(state.currentQuestion?.id).toBe('a1');
  });

  it('on a mid-interview fallback, continues forward and keeps coverage', async () => {
    const mock = new MockLlmProvider();
    let turn = 0;
    mock.setResponder((messages) => {
      const text = messages.map((m) => m.content).join('\n');
      if (!text.includes('NEXT question')) {
        return JSON.stringify({ provider: 'mock' }); // intent → fallback
      }
      turn += 1;
      if (turn <= 2) {
        return JSON.stringify({
          done: false,
          coverage: 0.5,
          phase: 'features',
          question: `Q${turn}?`,
        });
      }
      return 'not json'; // 3rd turn fails → plan fallback
    });

    const svc = makeService(mock);
    const { sessionId } = await svc.start(sessionIdea());
    await svc.answer(sessionId, 'a'); // → Q2?
    const s = await svc.answer(sessionId, 'b'); // adaptive fails → plan fallback

    // Did NOT restart at the first plan question…
    expect(s.currentQuestion?.id).not.toBe('a1');
    // …picked the next plan question by position (a1, a2, [b1])…
    expect(s.currentQuestion?.id).toBe('b1');
    // …and coverage did not drop back to the length ratio (2/11 ≈ 0.18).
    expect(s.completeness).toBe(0.5);
  });
});

/** A fresh idea object (avoids sharing the module-level IDEA across mutations). */
function sessionIdea() {
  return { idea: 'A clinic management system with appointments and billing' };
}
