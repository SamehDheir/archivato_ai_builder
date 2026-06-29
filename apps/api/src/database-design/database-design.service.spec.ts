import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseDesignService } from './database-design.service';
import { InMemoryDatabaseDesignRepository } from './in-memory-database-design.repository';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

const IDEA = {
  idea: 'A clinic system with appointments, billing, notifications and reports',
};

interface Harness {
  interview: InterviewService;
  requirements: RequirementsService;
  systemDesign: SystemDesignService;
  service: DatabaseDesignService;
  mock: MockLlmProvider;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const mock = new MockLlmProvider();

  const interview = new InterviewService(
    sessionRepo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
  );
  const requirements = new RequirementsService(
    sessionRepo,
    docRepo,
    new RequirementEngineerAgent(mock),
  );
  const systemDesign = new SystemDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    new SystemArchitectAgent(mock),
  );
  const service = new DatabaseDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    new DatabaseDesignerAgent(mock),
  );
  return { interview, requirements, systemDesign, service, mock };
}

async function confirm(interview: InterviewService): Promise<string> {
  const { sessionId } = await interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await interview.answer(
      sessionId,
      'payments billing notifications email reports dashboard',
    );
  }
  await interview.confirm(sessionId);
  return sessionId;
}

describe('DatabaseDesignService', () => {
  it('throws NotFound for an unknown session', async () => {
    const { service } = makeHarness();
    await expect(service.generate('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires the system design to exist first', async () => {
    const { interview, requirements, service } = makeHarness();
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);
    // system design not generated yet
    await expect(service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('builds a deterministic schema with PKs, FKs and relations', async () => {
    const { interview, requirements, systemDesign, service } = makeHarness();
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);
    await systemDesign.generate(sessionId);

    const design = await service.generate(sessionId);
    expect(design.sessionId).toBe(sessionId);
    expect(design.databaseType).toBe('PostgreSQL');

    const users = design.entities.find((e) => e.name === 'users');
    expect(users).toBeDefined();
    expect(users!.columns.find((c) => c.primaryKey)?.name).toBe('id');

    // Billing/Notifications/Reporting services -> tables with user FKs
    const names = design.entities.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining(['users', 'invoices', 'notifications', 'reports']),
    );
    const invoices = design.entities.find((e) => e.name === 'invoices')!;
    const fk = invoices.columns.find((c) => c.references);
    expect(fk?.references).toEqual({ entity: 'users', column: 'id' });

    expect(
      design.relations.some((r) => r.from === 'users' && r.to === 'invoices'),
    ).toBe(true);
  });

  it('prefers a valid LLM schema when the provider conforms', async () => {
    const harness = makeHarness();
    const { interview, requirements, systemDesign, service, mock } = harness;
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);
    await systemDesign.generate(sessionId);

    const llmDesign = {
      databaseType: 'PostgreSQL',
      entities: [
        {
          name: 'patients',
          description: 'clinic patients',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
        },
      ],
      relations: [],
    };
    mock.enqueueJson(llmDesign);

    const design = await service.generate(sessionId);
    expect(design.entities[0].name).toBe('patients');
    expect(design.sessionId).toBe(sessionId);
  });

  it('get() returns a stored design and 404s otherwise', async () => {
    const { interview, requirements, systemDesign, service } = makeHarness();
    const sessionId = await confirm(interview);
    await requirements.generate(sessionId);
    await systemDesign.generate(sessionId);

    await expect(service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.generate(sessionId);
    expect((await service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
