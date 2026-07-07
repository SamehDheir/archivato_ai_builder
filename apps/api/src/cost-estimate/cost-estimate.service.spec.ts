import { ConflictException, NotFoundException } from '@nestjs/common';
import { COST_USER_SCALES } from '@archivato/shared';
import { CostEstimateService } from './cost-estimate.service';
import { InMemoryCostEstimateRepository } from './in-memory-cost-estimate.repository';
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
  service: CostEstimateService;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const estimateRepo = new InMemoryCostEstimateRepository();
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
  const service = new CostEstimateService(
    sessionRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    estimateRepo,
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

/** Run the whole pipeline up to (but not including) the cost estimate. */
async function pipeline(h: Harness): Promise<string> {
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

describe('CostEstimateService', () => {
  it('throws NotFound for an unknown session', async () => {
    const h = makeHarness();
    await expect(h.service.generate('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires the API design to exist first', async () => {
    const h = makeHarness();
    const { sessionId } = await h.interview.start(IDEA);
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const state = await h.interview.getState(sessionId);
      if (state.status !== 'collecting') break;
      await h.interview.answer(sessionId, 'x');
    }
    await h.interview.confirm(sessionId);
    await h.requirements.generate(sessionId);
    await h.systemDesign.generate(sessionId);
    await h.databaseDesign.generate(sessionId);
    // api design intentionally not generated
    await expect(h.service.generate(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('produces a deterministic multi-provider estimate at every scale', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const est = await h.service.generate(sessionId);
    expect(est.sessionId).toBe(sessionId);
    expect(est.scales).toEqual([...COST_USER_SCALES]);
    expect(est.providers.length).toBeGreaterThanOrEqual(6);
    for (const p of est.providers) {
      expect(p.costs).toHaveLength(COST_USER_SCALES.length);
      for (const c of p.costs) {
        expect(c.monthlyUsd).toBeGreaterThanOrEqual(0);
        expect(c.lineItems.length).toBeGreaterThan(0);
      }
      // Cost is monotonic non-decreasing as the user base grows.
      expect(p.costs[0].monthlyUsd).toBeLessThanOrEqual(p.costs[1].monthlyUsd);
      expect(p.costs[1].monthlyUsd).toBeLessThanOrEqual(p.costs[2].monthlyUsd);
    }
    // The recommended provider is the cheapest by total across scales.
    expect(est.providers.some((p) => p.provider === est.recommended)).toBe(true);
    expect(Object.keys(est.cheapestByScale)).toEqual(
      COST_USER_SCALES.map(String),
    );
  });

  it('is stable across repeated generations (deterministic)', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);
    const a = await h.service.generate(sessionId);
    const b = await h.service.generate(sessionId);
    expect(b.providers).toEqual(a.providers);
    expect(b.recommended).toBe(a.recommended);
  });

  it('get() returns a stored estimate and 404s otherwise', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    await expect(h.service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await h.service.generate(sessionId);
    expect((await h.service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
