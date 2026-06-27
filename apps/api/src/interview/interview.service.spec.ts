import { ConflictException, NotFoundException } from '@nestjs/common';
import { COMPLETENESS_THRESHOLD, type IntentAnalysis } from '@archivato/shared';
import { InterviewService } from './interview.service';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from './question-plan';

function makeService(mock = new MockLlmProvider()): InterviewService {
  const repo = new InMemoryInterviewSessionRepository();
  const analyst = new ProductAnalystAgent(mock);
  return new InterviewService(repo, analyst);
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
});
