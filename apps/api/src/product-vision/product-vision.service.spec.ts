import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductVisionService } from './product-vision.service';
import { InMemoryProductVisionRepository } from './in-memory-product-vision.repository';
import { ProductManagerAgent } from '../llm/agents/product-manager.agent';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

const IDEA = {
  idea: 'A clinic system with appointments, billing, notifications and reports',
};

interface Harness {
  interview: InterviewService;
  service: ProductVisionService;
  mock: MockLlmProvider;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const visionRepo = new InMemoryProductVisionRepository();
  const mock = new MockLlmProvider();

  const interview = new InterviewService(
    sessionRepo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
  );
  const service = new ProductVisionService(
    sessionRepo,
    visionRepo,
    new ProductManagerAgent(mock),
  );
  return { interview, service, mock };
}

/** Drive the interview to a confirmed session. */
async function confirmedSession(h: Harness): Promise<string> {
  const { sessionId } = await h.interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'payments billing notifications reports');
  }
  await h.interview.confirm(sessionId);
  return sessionId;
}

describe('ProductVisionService', () => {
  it('throws NotFound for an unknown session', async () => {
    const h = makeHarness();
    await expect(h.service.generate('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires a confirmed interview', async () => {
    const h = makeHarness();
    const { sessionId } = await h.interview.start(IDEA);
    // Not confirmed yet.
    await expect(h.service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('produces a deterministic vision with all sections', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);

    const vision = await h.service.generate(sessionId);
    expect(vision.sessionId).toBe(sessionId);
    expect(vision.vision).toBeTruthy();
    expect(vision.goals.length).toBeGreaterThan(0);
    expect(vision.mvp.length).toBeGreaterThan(0);
    expect(Array.isArray(vision.futureFeatures)).toBe(true);
    expect(vision.successMetrics.length).toBeGreaterThan(0);
    expect(vision.personas.length).toBeGreaterThan(0);
    expect(vision.personas[0].name).toBeTruthy();
  });

  it('prefers a valid LLM vision when the provider conforms', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);

    const llmVision = {
      vision: 'A north star',
      goals: ['grow'],
      mvp: ['core'],
      futureFeatures: ['more'],
      successMetrics: [{ name: 'MRR', target: '$10k', rationale: 'revenue' }],
      personas: [
        { name: 'Admin', description: 'runs it', goals: ['x'], painPoints: ['y'] },
      ],
    };
    h.mock.enqueueJson(llmVision);

    const vision = await h.service.generate(sessionId);
    expect(vision.vision).toBe('A north star');
    expect(vision.successMetrics[0].name).toBe('MRR');
    expect(vision.sessionId).toBe(sessionId);
  });

  it('get() returns a stored vision and 404s otherwise', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);

    await expect(h.service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await h.service.generate(sessionId);
    expect((await h.service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
