import { ConflictException, NotFoundException } from '@nestjs/common';
import { isStale } from '@archivato/shared';
import { RoadmapService } from './roadmap.service';
import { InMemoryProjectRoadmapRepository } from './in-memory-roadmap.repository';
import { RoadmapPlannerAgent } from '../llm/agents/roadmap-planner.agent';
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
import { InMemoryBusinessAnalysisRepository } from '../business-analysis/in-memory-business-analysis.repository';
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
  service: RoadmapService;
  mock: MockLlmProvider;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const roadmapRepo = new InMemoryProjectRoadmapRepository();
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
  const apiDesign = new ApiDesignService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    new ApiDesignerAgent(mock),
  );
  const service = new RoadmapService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    roadmapRepo,
    new RoadmapPlannerAgent(mock),
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    service,
    mock,
  };
}

/**
 * The revision marker is `generatedAt`, at millisecond resolution. Against a real
 * provider two generations are seconds apart; with the mock they can land in the
 * same millisecond, so a test that regenerates back-to-back has to step the clock.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run the whole pipeline up to (but not including) the roadmap. */
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

describe('RoadmapService', () => {
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

  it('produces a deterministic phased roadmap', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const roadmap = await h.service.generate(sessionId);
    expect(roadmap.sessionId).toBe(sessionId);
    expect(roadmap.summary).toBeTruthy();
    expect(roadmap.totalEstimate).toMatch(/wk/);
    expect(roadmap.phases.length).toBeGreaterThan(0);
    // The first phase is Foundation with no dependencies; later ones sequence.
    expect(roadmap.phases[0].name).toBe('Foundation');
    expect(roadmap.phases[0].dependsOn).toEqual([]);
    for (const phase of roadmap.phases) {
      expect(phase.milestones.length).toBeGreaterThan(0);
      for (const m of phase.milestones) {
        expect(m.tasks.length).toBeGreaterThan(0);
      }
    }
  });

  // R10 — the deterministic roadmap flags phase 1 as the MVP and carries an
  // effort-grounded week range on every phase (computed in code from the design).
  it('flags the MVP and carries effort-grounded phase week ranges', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const roadmap = await h.service.generate(sessionId);
    expect(roadmap.phases[0].isMvp).toBe(true);
    expect(roadmap.phases[0].mvpStatement).toBeTruthy();
    expect(roadmap.phases.slice(1).every((p) => !p.isMvp)).toBe(true);
    for (const p of roadmap.phases) {
      expect(typeof p.weeksMin).toBe('number');
      expect(typeof p.weeksMax).toBe('number');
      expect(p.weeksMax!).toBeGreaterThanOrEqual(p.weeksMin!);
    }
    // The total is a range derived from the effort estimate.
    expect(roadmap.totalEstimate).toMatch(/wks/);
    // No dual roadmap without a stated timeline conflict.
    expect(roadmap.alternativeRoadmaps).toBeUndefined();
  });

  it('stamps the design revision it was built from, and goes stale with it', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    /** The design revisions as they stand right now. */
    const current = async () => ({
      requirements: (await h.requirements.get(sessionId)).generatedAt,
      systemDesign: (await h.systemDesign.get(sessionId)).generatedAt,
      databaseDesign: (await h.databaseDesign.get(sessionId)).generatedAt,
      apiDesign: (await h.apiDesign.get(sessionId)).generatedAt,
    });

    const roadmap = await h.service.generate(sessionId);
    expect(roadmap.sourceStamp).toBeTruthy();
    expect(isStale('roadmap', roadmap, await current())).toBe(false);

    // What a chat refine does to the design chain — and what it does NOT do to
    // the roadmap, which is the bug: it is left describing the previous design.
    await sleep(2);
    await h.systemDesign.generate(sessionId);

    expect(isStale('roadmap', roadmap, await current())).toBe(true);
    // Regenerating re-stamps it against the new design.
    const fresh = await h.service.generate(sessionId);
    expect(isStale('roadmap', fresh, await current())).toBe(false);
  });

  it('prefers a valid LLM roadmap when the provider conforms', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const llmRoadmap = {
      summary: 'ship it',
      totalEstimate: '~6 weeks',
      phases: [
        {
          name: 'MVP',
          goal: 'core',
          effort: '~3 wks',
          dependsOn: [],
          milestones: [{ title: 'Auth', effort: '1 wk', tasks: [{ title: 'JWT' }] }],
        },
      ],
    };
    h.mock.enqueueJson(llmRoadmap);

    const roadmap = await h.service.generate(sessionId);
    expect(roadmap.summary).toBe('ship it');
    expect(roadmap.phases).toHaveLength(1);
    expect(roadmap.phases[0].name).toBe('MVP');
    expect(roadmap.phases[0].milestones[0].tasks[0].title).toBe('JWT');
  });

  it('get() returns a stored roadmap and 404s otherwise', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    await expect(h.service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await h.service.generate(sessionId);
    expect((await h.service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
