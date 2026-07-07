import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExportService } from './export.service';
import { InterviewService } from '../interview/interview.service';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { RequirementsService } from '../requirements/requirements.service';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { ApiDesignService } from '../api-design/api-design.service';
import { InMemoryApiDesignRepository } from '../api-design/in-memory-api-design.repository';
import { InMemoryReviewReportRepository } from '../review/in-memory-review-report.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ArchitectExplainerAgent } from '../llm/agents/architect-explainer.agent';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
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
  apiDesign: ApiDesignService;
  service: ExportService;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const reviewRepo = new InMemoryReviewReportRepository();
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
    new ArchitectExplainerAgent(mock),
  );
  const databaseDesign = new DatabaseDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    new DatabaseDesignerAgent(mock),
  );
  const apiDesign = new ApiDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    new ApiDesignerAgent(mock),
  );
  const service = new ExportService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    reviewRepo,
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    service,
  };
}

async function fullPipeline(h: Harness): Promise<string> {
  const { sessionId } = await h.interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'payments billing notifications reports');
  }
  await h.interview.confirm(sessionId);
  await h.requirements.generate(sessionId);
  await h.systemDesign.generate(sessionId);
  await h.databaseDesign.generate(sessionId);
  await h.apiDesign.generate(sessionId);
  return sessionId;
}

describe('ExportService', () => {
  it('throws NotFound for an unknown session', async () => {
    const h = makeHarness();
    await expect(h.service.bundle('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to export an incomplete pipeline', async () => {
    const h = makeHarness();
    const { sessionId } = await h.interview.start(IDEA);
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const state = await h.interview.getState(sessionId);
      if (state.status !== 'collecting') break;
      await h.interview.answer(sessionId, 'x');
    }
    await h.interview.confirm(sessionId);
    await h.requirements.generate(sessionId);
    // stop before system/db/api designs
    await expect(h.service.bundle(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('bundles all artifacts (review optional/null)', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const bundle = await h.service.bundle(sessionId);

    expect(bundle.sessionId).toBe(sessionId);
    expect(bundle.requirements.functional.length).toBeGreaterThan(0);
    expect(bundle.apiDesign.modules.length).toBeGreaterThan(0);
    expect(bundle.review).toBeNull();
  });

  it('renders Markdown with the major sections', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const md = await h.service.markdown(sessionId);

    expect(md).toContain('# Archivato — System Design');
    expect(md).toContain('## Requirements');
    expect(md).toContain('## System Design');
    expect(md).toContain('## Database Design');
    expect(md).toContain('## API Design');
  });

  it('builds a valid OpenAPI document', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const spec = await h.service.openapi(sessionId);

    expect(spec.openapi).toBe('3.0.3');
    const paths = spec.paths as Record<string, unknown>;
    // ":id" must be converted to "{id}" and no raw ":" params remain
    expect(Object.keys(paths).some((p) => p.includes('{id}'))).toBe(true);
    expect(Object.keys(paths).some((p) => p.includes(':'))).toBe(false);
    expect(paths['/api/users']).toBeDefined();
  });

  it('serves a schema-derived mock response for a designed endpoint', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const bundle = await h.service.bundle(sessionId);
    const ep = bundle.apiDesign.modules[0].endpoints[0];
    // Substitute a concrete value for any path parameter (":id" / "{id}").
    const path = ep.path.replace(/:[A-Za-z0-9_]+|\{[A-Za-z0-9_]+\}/g, '123');

    const res = await h.service.mock(sessionId, ep.method, path);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.body === null || typeof res.body === 'object').toBe(true);
  });

  it('404s an unmatched mock path or a session without an API design', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    await expect(
      h.service.mock(sessionId, 'GET', '/api/definitely-not-a-route'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      h.service.mock('nope', 'GET', '/api/users'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generates a GitHub project structure with module folders', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const structure = await h.service.structure(sessionId);

    const paths = structure.files.map((f) => f.path);
    expect(paths).toContain('README.md');
    expect(paths.some((p) => p.startsWith('src/modules/auth/'))).toBe(true);
    expect(paths).toContain('src/config/index.ts');
  });
});
