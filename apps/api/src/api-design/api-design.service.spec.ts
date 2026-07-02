import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApiDesignService } from './api-design.service';
import { InMemoryApiDesignRepository } from './in-memory-api-design.repository';
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
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
  databaseDesign: DatabaseDesignService;
  service: ApiDesignService;
  mock: MockLlmProvider;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const mock = new MockLlmProvider();

  const interview = new InterviewService(
    sessionRepo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
    undefined as never, // no billing enforcement for owner-less test sessions
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
  const databaseDesign = new DatabaseDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    new DatabaseDesignerAgent(mock),
  );
  const service = new ApiDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    new ApiDesignerAgent(mock),
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    service,
    mock,
  };
}

async function upstream(h: Harness): Promise<string> {
  const { sessionId } = await h.interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'payments billing notifications reports');
  }
  await h.interview.confirm(sessionId);
  await h.requirements.generate(sessionId);
  await h.systemDesign.generate(sessionId);
  return sessionId;
}

describe('ApiDesignService', () => {
  it('throws NotFound for an unknown session', async () => {
    const h = makeHarness();
    await expect(h.service.generate('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires the database design to exist first', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    // database design not generated yet
    await expect(h.service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('builds deterministic CRUD modules from the entities', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    await h.databaseDesign.generate(sessionId);

    const design = await h.service.generate(sessionId);
    expect(design.sessionId).toBe(sessionId);

    const moduleNames = design.modules.map((m) => m.name);
    expect(moduleNames).toContain('Auth');
    expect(moduleNames).toContain('Users');

    const users = design.modules.find((m) => m.name === 'Users')!;
    const methods = users.endpoints.map((e) => e.method);
    expect(methods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE']),
    );

    const create = users.endpoints.find(
      (e) => e.method === 'POST' && e.path === '/api/users',
    )!;
    expect(create.statusCodes).toContain(201);
    // server-managed fields are excluded from the write schema
    expect(create.requestSchema.find((f) => f.name === 'password_hash')).toBeUndefined();
    expect(create.requestSchema.find((f) => f.name === 'id')).toBeUndefined();
    // response includes the id
    expect(create.responseSchema.find((f) => f.name === 'id')).toBeDefined();
  });

  it('prefers a valid LLM design when the provider conforms', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    await h.databaseDesign.generate(sessionId);

    const llmDesign = {
      modules: [
        {
          name: 'Appointments',
          basePath: '/api/appointments',
          endpoints: [
            {
              method: 'GET',
              path: '/api/appointments',
              summary: 'list',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    };
    h.mock.enqueueJson(llmDesign);

    const design = await h.service.generate(sessionId);
    expect(design.modules[0].name).toBe('Appointments');
    expect(design.sessionId).toBe(sessionId);
  });

  it('get() returns a stored design and 404s otherwise', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    await h.databaseDesign.generate(sessionId);

    await expect(h.service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await h.service.generate(sessionId);
    expect((await h.service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
