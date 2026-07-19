import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReviewService } from './review.service';
import { InMemoryReviewReportRepository } from './in-memory-review-report.repository';
import { ReviewerAgent } from '../llm/agents/reviewer.agent';
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
import { InMemoryCostEstimateRepository } from '../cost-estimate/in-memory-cost-estimate.repository';
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
  sessions: InMemoryInterviewSessionRepository;
  service: ReviewService;
  mock: MockLlmProvider;
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
  const service = new ReviewService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    new InMemoryCostEstimateRepository(),
    reviewRepo,
    new ReviewerAgent(mock),
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    sessions: sessionRepo,
    service,
    mock,
  };
}

/** Run the whole pipeline up to (but not including) the review. */
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

describe('ReviewService', () => {
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

  it('produces a deterministic review with score and findings', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const report = await h.service.generate(sessionId);
    expect(report.sessionId).toBe(sessionId);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    // Every dimension gets a 0-100 sub-score, and the legacy alias mirrors it.
    for (const dim of ['security', 'scalability', 'performance', 'cost'] as const) {
      expect(report.scores[dim]).toBeGreaterThanOrEqual(0);
      expect(report.scores[dim]).toBeLessThanOrEqual(100);
    }
    expect(report.scalabilityScore).toBe(report.scores.scalability);
    expect(report.summary).toBeTruthy();
    // Pagination exists in the API design, so no "unbounded list" risk.
    expect(
      report.performanceRisks.find((r) => r.title.includes('Unbounded')),
    ).toBeUndefined();
    // Cost optimization is always populated (new dimension).
    expect(report.costOptimizations.length).toBeGreaterThan(0);
    expect(Array.isArray(report.scalabilityIssues)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('prefers a valid LLM review when the provider conforms', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const llmReview = {
      scalabilityScore: 88,
      summary: 'looks good',
      securityIssues: [],
      performanceRisks: [],
      missingFeatures: ['SSO'],
      recommendations: ['ship it'],
    };
    h.mock.enqueueJson(llmReview);

    const report = await h.service.generate(sessionId);
    expect(report.scalabilityScore).toBe(88);
    expect(report.recommendations).toEqual(['ship it']);
    expect(report.sessionId).toBe(sessionId);
  });

  // R10 — the offline fallback shows the new axis: a neutral client-readiness
  // score + a "requires AI review" note, plus any automated consistency findings.
  it('includes a neutral client-readiness axis + note in the deterministic fallback', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const report = await h.service.generate(sessionId);
    expect(report.scores.clientReadiness).toBe(70);
    expect(report.clientReadinessNote).toBeTruthy();
    expect(report.clientReadinessIssues).toEqual([]);
    expect(Array.isArray(report.consistencyFindings)).toBe(true);
  });

  // R10 — a tight timeline slot fires the deterministic effort-vs-timeline
  // consistency check (A2), tagged 'automated', even offline.
  it('flags an effort-vs-timeline conflict as an automated consistency finding', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);
    const session = await h.sessions.findById(sessionId);
    await h.sessions.save({
      ...session!,
      slots: { timeline: { value: '1 day', confidence: 'high', source: 'explicit' } },
    });

    const report = await h.service.generate(sessionId);
    const conflict = report.consistencyFindings?.find(
      (f) => f.artifacts.join() === 'effort,timeline',
    );
    expect(conflict).toBeDefined();
    expect(conflict!.source).toBe('automated');
  });

  it('get() returns a stored report and 404s otherwise', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    await expect(h.service.get(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await h.service.generate(sessionId);
    expect((await h.service.get(sessionId)).sessionId).toBe(sessionId);
  });
});
