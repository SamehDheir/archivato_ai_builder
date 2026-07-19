import { ConflictException, NotFoundException } from '@nestjs/common';
import { validateEntityCoverage } from '@archivato/shared';
import { ApiDesignService } from './api-design.service';
import { InMemoryApiDesignRepository } from './in-memory-api-design.repository';
import {
  ApiDesignerAgent,
  MAX_ENTITIES_PER_CALL,
} from '../llm/agents/api-designer.agent';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { InMemoryBusinessAnalysisRepository } from '../business-analysis/in-memory-business-analysis.repository';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ArchitectExplainerAgent } from '../llm/agents/architect-explainer.agent';
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
    new InMemoryBusinessAnalysisRepository(),
    new RequirementEngineerAgent(mock),
  );
  const systemDesign = new SystemDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    new SystemArchitectAgent(mock),
    new ArchitectExplainerAgent(mock),
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

  it('normalizes a partial LLM endpoint so array fields never persist as undefined', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    await h.databaseDesign.generate(sessionId);

    // A conforming-but-partial endpoint: no method, no path, no statusCodes, no
    // request/response schema. All must be coerced or the view/OpenAPI/scaffold
    // builders get undefined.
    h.mock.enqueueJson({
      modules: [
        {
          name: 'Appointments',
          basePath: '/api/appointments',
          endpoints: [{ summary: 'list' }],
        },
      ],
    });

    const design = await h.service.generate(sessionId);
    const ep = design.modules[0].endpoints[0];
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/api/appointments');
    expect(Array.isArray(ep.statusCodes)).toBe(true);
    expect(Array.isArray(ep.requestSchema)).toBe(true);
    expect(Array.isArray(ep.responseSchema)).toBe(true);
  });

  it('repairs an LLM design that leaves entities uncovered', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    const db = await h.databaseDesign.generate(sessionId);
    const names = db.entities.map((e) => e.name);
    expect(names.length).toBeGreaterThan(2);

    const [first, ...missing] = names;

    // The reported bug, scripted: the model groups around one resource and the
    // rest of the tables get no API at all.
    h.mock.enqueueJson({
      modules: [
        {
          name: 'First',
          basePath: `/api/${first}`,
          coveredEntities: [first],
          endpoints: [
            {
              method: 'GET',
              path: `/api/${first}`,
              summary: 'list',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    });
    // The repair call answers with groups for exactly the entities it was given.
    h.mock.enqueueJson({
      modules: missing.map((name) => ({
        name: `Repaired ${name}`,
        basePath: `/api/${name}`,
        coveredEntities: [name],
        endpoints: [
          {
            method: 'GET',
            path: `/api/${name}`,
            summary: 'list',
            requestSchema: [],
            responseSchema: [],
            statusCodes: [200],
          },
        ],
      })),
    });

    const design = await h.service.generate(sessionId);
    expect(validateEntityCoverage(design, names).ok).toBe(true);
    for (const name of missing) {
      expect(design.modules.some((m) => m.name === `Repaired ${name}`)).toBe(true);
    }
    // Repaired by the model, so nothing needs the review flag.
    expect(design.modules.some((m) => m.source === 'generated-fallback')).toBe(false);
  });

  it('never persists a design with uncovered entities, even if the repair fails', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    const db = await h.databaseDesign.generate(sessionId);
    const names = db.entities.map((e) => e.name);
    const [first, ...missing] = names;

    // One good group, then a repair call that returns junk (the mock's default
    // echo response) — the gap has to close deterministically or not at all.
    h.mock.enqueueJson({
      modules: [
        {
          name: 'First',
          basePath: `/api/${first}`,
          coveredEntities: [first],
          endpoints: [
            {
              method: 'GET',
              path: `/api/${first}`,
              summary: 'list',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    });

    const design = await h.service.generate(sessionId);
    expect(validateEntityCoverage(design, names).ok).toBe(true);

    // And what the code had to invent says so, so the user can review it.
    for (const name of missing) {
      const owner = design.modules.find((m) =>
        (m.coveredEntities ?? []).includes(name),
      );
      expect(owner?.source).toBe('generated-fallback');
    }

    // The guarantee holds on the way back out of the store too.
    expect(validateEntityCoverage(await h.service.get(sessionId), names).ok).toBe(
      true,
    );
  });

  it('will not let one chunk excuse an entity that belongs to another', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    const db = await h.databaseDesign.generate(sessionId);
    const names = db.entities.map((e) => e.name);
    // The design has to be big enough to be generated in more than one call.
    expect(names.length).toBeGreaterThan(4);
    const last = names[names.length - 1];

    // Chunk 1 answers, and excuses an entity it was never given. Chunk 2 — the
    // one that actually owns it — then fails. Unscoped, that exclusion would
    // stand in for the missing API and nothing would fill it.
    h.mock.enqueueJson({
      modules: [
        {
          name: 'First',
          basePath: `/api/${names[0]}`,
          coveredEntities: [names[0]],
          endpoints: [
            {
              method: 'GET',
              path: `/api/${names[0]}`,
              summary: 'list',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
      excludedEntities: [{ entity: last, reason: 'Internal table, no client use.' }],
    });

    const design = await h.service.generate(sessionId);
    expect(
      (design.excludedEntities ?? []).some((e) => e.entity === last),
    ).toBe(false);
    const owner = design.modules.find((m) =>
      (m.coveredEntities ?? []).includes(last),
    );
    expect(owner?.source).toBe('generated-fallback');
    expect(validateEntityCoverage(design, names).ok).toBe(true);
  });

  it('credits a real resource the model never declared coverage for', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    const db = await h.databaseDesign.generate(sessionId);
    const names = db.entities.map((e) => e.name);

    // No coveredEntities anywhere — paths only. Inference must see these, or the
    // repair pass would build a second resource next to each of them.
    h.mock.enqueueJson({
      modules: names.map((name) => ({
        name: `Mod ${name}`,
        basePath: `/api/${name}`,
        endpoints: [
          {
            method: 'GET',
            path: `/api/${name}`,
            summary: 'list',
            requestSchema: [],
            responseSchema: [],
            statusCodes: [200],
          },
        ],
      })),
    });

    const design = await h.service.generate(sessionId);
    expect(validateEntityCoverage(design, names).ok).toBe(true);
    expect(design.modules).toHaveLength(names.length);
    expect(design.modules.every((m) => m.source === 'llm')).toBe(true);
  });

  it('keeps an entity excluded with a reason, without inventing a resource', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    const db = await h.databaseDesign.generate(sessionId);
    const names = db.entities.map((e) => e.name);
    // Exclusions only count for the entities the answering call was given, so
    // scope this to the first chunk's.
    const [first, ...excused] = names.slice(0, MAX_ENTITIES_PER_CALL);

    h.mock.enqueueJson({
      modules: [
        {
          name: 'First',
          basePath: `/api/${first}`,
          coveredEntities: [first],
          endpoints: [
            {
              method: 'GET',
              path: `/api/${first}`,
              summary: 'list',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
      excludedEntities: excused.map((entity) => ({
        entity,
        reason: `Join table managed through the First resource (/api/${first}).`,
      })),
    });

    const design = await h.service.generate(sessionId);
    expect(validateEntityCoverage(design, names).ok).toBe(true);

    // A justified exclusion stands — no resource is invented for it.
    for (const entity of excused) {
      expect((design.excludedEntities ?? []).some((e) => e.entity === entity)).toBe(
        true,
      );
      expect(
        design.modules.some((m) => (m.coveredEntities ?? []).includes(entity)),
      ).toBe(false);
    }
  });

  it('save() keeps the exclusions the editor cannot see and recomputes coverage', async () => {
    const h = makeHarness();
    const sessionId = await upstream(h);
    await h.databaseDesign.generate(sessionId);
    const generated = await h.service.generate(sessionId);
    const excluded = generated.excludedEntities;

    // What the editor actually sends: modules only.
    const saved = await h.service.save(sessionId, {
      modules: generated.modules.map((m) => ({
        name: m.name,
        basePath: m.basePath,
        endpoints: m.endpoints,
      })),
    });

    expect(saved.excludedEntities).toEqual(excluded);
    const users = saved.modules.find((m) => m.name === 'Users');
    expect(users?.coveredEntities).toEqual(['users']);
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
