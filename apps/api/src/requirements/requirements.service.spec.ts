import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RequirementDocument } from '@archivato/shared';
import { RequirementsService } from './requirements.service';
import { InMemoryRequirementDocumentRepository } from './in-memory-requirement-document.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

const IDEA = { idea: 'A clinic management system with appointments and billing' };

/** Build an interview service sharing the given session repo. */
function makeInterview(
  repo: InMemoryInterviewSessionRepository,
  mock: MockLlmProvider,
) {
  return new InterviewService(
    repo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
  );
}

async function confirmedSession(
  interview: InterviewService,
): Promise<string> {
  const { sessionId } = await interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await interview.answer(sessionId, `feature answer ${i}`);
  }
  await interview.confirm(sessionId);
  return sessionId;
}

describe('RequirementsService', () => {
  let sessionRepo: InMemoryInterviewSessionRepository;
  let docRepo: InMemoryRequirementDocumentRepository;
  let mock: MockLlmProvider;
  let interview: InterviewService;
  let service: RequirementsService;

  beforeEach(() => {
    sessionRepo = new InMemoryInterviewSessionRepository();
    docRepo = new InMemoryRequirementDocumentRepository();
    mock = new MockLlmProvider();
    interview = makeInterview(sessionRepo, mock);
    service = new RequirementsService(
      sessionRepo,
      docRepo,
      new RequirementEngineerAgent(mock),
    );
  });

  it('throws NotFound for an unknown session', async () => {
    await expect(service.generate('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to generate before the interview is confirmed', async () => {
    const { sessionId } = await interview.start(IDEA);
    await expect(service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('builds a deterministic document from a confirmed interview', async () => {
    const sessionId = await confirmedSession(interview);
    const doc = await service.generate(sessionId);

    expect(doc.sessionId).toBe(sessionId);
    expect(doc.functional.length).toBeGreaterThan(0);
    expect(doc.functional[0].id).toBe('FR-1');
    expect(doc.nonFunctional.some((n) => n.category === 'security')).toBe(true);
    expect(typeof doc.generatedAt).toBe('string');
  });

  it('prefers a valid LLM document when the provider conforms', async () => {
    const sessionId = await confirmedSession(interview);

    const llmDoc: Partial<RequirementDocument> = {
      functional: [
        { id: 'FR-1', title: 'Book appointment', description: '…', priority: 'must' },
      ],
      nonFunctional: [{ id: 'NFR-1', category: 'security', description: '…' }],
      roles: [{ name: 'doctor', description: '…', permissions: ['read'] }],
      businessRules: [{ id: 'BR-1', description: '…' }],
      constraints: ['SQL'],
      assumptions: ['…'],
    };
    mock.enqueueJson(llmDoc); // consumed by the requirement engineer call

    const doc = await service.generate(sessionId);
    expect(doc.functional[0].title).toBe('Book appointment');
    expect(doc.sessionId).toBe(sessionId); // stamped by the service/agent
  });

  it('get() returns a stored doc and 404s otherwise', async () => {
    const sessionId = await confirmedSession(interview);
    await expect(service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.generate(sessionId);
    const fetched = await service.get(sessionId);
    expect(fetched.sessionId).toBe(sessionId);
  });
});
