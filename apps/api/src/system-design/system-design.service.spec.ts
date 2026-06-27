import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RequirementDocument } from '@archivato/shared';
import { SystemDesignService } from './system-design.service';
import { InMemorySystemDesignRepository } from './in-memory-system-design.repository';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

const IDEA = {
  idea: 'A clinic system with appointments, billing, notifications and reports',
};

interface Harness {
  interview: InterviewService;
  requirements: RequirementsService;
  service: SystemDesignService;
  mock: MockLlmProvider;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const designRepo = new InMemorySystemDesignRepository();
  const mock = new MockLlmProvider();

  const interview = new InterviewService(
    sessionRepo,
    new ProductAnalystAgent(mock),
  );
  const requirements = new RequirementsService(
    sessionRepo,
    docRepo,
    new RequirementEngineerAgent(mock),
  );
  const service = new SystemDesignService(
    sessionRepo,
    docRepo,
    designRepo,
    new SystemArchitectAgent(mock),
  );
  return { interview, requirements, service, mock };
}

async function confirm(interview: InterviewService): Promise<string> {
  const { sessionId } = await interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    // Answer with text that triggers billing/notification/report services.
    await interview.answer(
      sessionId,
      'payments billing notifications email reports dashboard',
    );
  }
  await interview.confirm(sessionId);
  return sessionId;
}

describe('SystemDesignService', () => {
  it('throws NotFound for an unknown session', async () => {
    const { service } = makeHarness();
    await expect(service.generate('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires a confirmed interview', async () => {
    const { interview, service } = makeHarness();
    const { sessionId } = await interview.start(IDEA);
    await expect(service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires the requirement document to exist first', async () => {
    const { interview, service } = makeHarness();
    const sessionId = await confirm(interview);
    // requirements not generated yet
    await expect(service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('builds a deterministic design from the requirements', async () => {
    const { interview, requirements, service } = makeHarness();
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);

    const design = await service.generate(sessionId);
    expect(design.sessionId).toBe(sessionId);
    expect(design.architecture).toBe('modular_monolith');
    expect(design.techStack.length).toBeGreaterThan(0);
    const names = design.services.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Auth', 'Users']));
    // keywords in answers should have added these services
    expect(names).toEqual(
      expect.arrayContaining(['Billing', 'Notifications', 'Reporting']),
    );
  });

  it('prefers a valid LLM design when the provider conforms', async () => {
    const harness = makeHarness();
    const { interview, requirements, service, mock } = harness;
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);

    const llmDesign = {
      architecture: 'microservices',
      architectureRationale: 'because',
      techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'x' }],
      services: [{ name: 'Gateway', responsibility: 'edge', dependencies: [] }],
    };
    mock.enqueueJson(llmDesign);

    const design = await service.generate(sessionId);
    expect(design.architecture).toBe('microservices');
    expect(design.services[0].name).toBe('Gateway');
    expect(design.sessionId).toBe(sessionId);
  });

  it('get() returns a stored design and 404s otherwise', async () => {
    const { interview, requirements, service } = makeHarness();
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);

    await expect(service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.generate(sessionId);
    expect((await service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
