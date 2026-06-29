import { ConflictException, NotFoundException } from '@nestjs/common';
import { RefinementService } from './refinement.service';
import { InMemoryChatMessageRepository } from './in-memory-chat-message.repository';
import { RefinementAgent } from '../llm/agents/refinement.agent';
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
import { ReviewService } from '../review/review.service';
import { InMemoryReviewReportRepository } from '../review/in-memory-review-report.repository';
import { VersionsService } from '../versions/versions.service';
import { InMemoryProjectVersionRepository } from '../versions/in-memory-project-version.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
import { ReviewerAgent } from '../llm/agents/reviewer.agent';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';

// A deliberately plain idea so the baseline design has NO notifications and a
// modular-monolith architecture — making refinements observable.
const IDEA = { idea: 'A simple personal todo list app' };

interface Harness {
  interview: InterviewService;
  requirements: RequirementsService;
  systemDesign: SystemDesignService;
  databaseDesign: DatabaseDesignService;
  apiDesign: ApiDesignService;
  review: ReviewService;
  reviewRepo: InMemoryReviewReportRepository;
  service: RefinementService;
}

function makeHarness(): Harness {
  const sessionRepo = new InMemoryInterviewSessionRepository();
  const docRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const reviewRepo = new InMemoryReviewReportRepository();
  const chatRepo = new InMemoryChatMessageRepository();
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
  const review = new ReviewService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    reviewRepo,
    new ReviewerAgent(mock),
  );
  const versions = new VersionsService(
    new InMemoryProjectVersionRepository(),
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    reviewRepo,
  );
  const service = new RefinementService(
    sessionRepo,
    docRepo,
    apiRepo,
    reviewRepo,
    chatRepo,
    new RefinementAgent(mock),
    systemDesign,
    databaseDesign,
    apiDesign,
    review,
    versions,
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    review,
    reviewRepo,
    service,
  };
}

/** Run the pipeline through the API design (chat becomes available after this). */
async function pipeline(h: Harness): Promise<string> {
  const { sessionId } = await h.interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'basic task tracking for one user');
  }
  await h.interview.confirm(sessionId);
  await h.requirements.generate(sessionId);
  await h.systemDesign.generate(sessionId);
  await h.databaseDesign.generate(sessionId);
  await h.apiDesign.generate(sessionId);
  return sessionId;
}

describe('RefinementService', () => {
  it('throws NotFound for an unknown session', async () => {
    const h = makeHarness();
    await expect(h.service.refine('nope', 'Add notifications')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to refine before a full design exists', async () => {
    const h = makeHarness();
    const { sessionId } = await h.interview.start(IDEA);
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const state = await h.interview.getState(sessionId);
      if (state.status !== 'collecting') break;
      await h.interview.answer(sessionId, 'x');
    }
    await h.interview.confirm(sessionId);
    await h.requirements.generate(sessionId);
    // no system/db/api design yet
    await expect(
      h.service.refine(sessionId, 'Add notifications'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('“Add notifications” cascades a Notifications service into the design', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    // Baseline has no Notifications service.
    const before = await h.systemDesign.get(sessionId);
    expect(before.services.some((s) => s.name === 'Notifications')).toBe(false);

    const result = await h.service.refine(
      sessionId,
      'Add notifications and email alerts',
    );

    expect(
      result.systemDesign.services.some((s) => s.name === 'Notifications'),
    ).toBe(true);
    // The requirement document grew by the new FR.
    expect(result.requirementDocument.functional.length).toBeGreaterThan(
      before.services.length,
    );
    // Transcript persisted: user instruction + assistant summary.
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    // No review existed, so it stays null.
    expect(result.reviewReport).toBeNull();
  });

  it('“scalable to 5 million users” redesigns toward microservices', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    const before = await h.systemDesign.get(sessionId);
    expect(before.architecture).not.toBe('microservices');

    const result = await h.service.refine(
      sessionId,
      'Make it scalable to 5 million users',
    );
    expect(result.systemDesign.architecture).toBe('microservices');
  });

  it('regenerates the review only when one already exists', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);
    await h.review.generate(sessionId);

    const result = await h.service.refine(sessionId, 'Add notifications');
    expect(result.reviewReport).not.toBeNull();
    expect(result.reviewReport!.sessionId).toBe(sessionId);
  });

  it('accumulates the transcript across turns', async () => {
    const h = makeHarness();
    const sessionId = await pipeline(h);

    await h.service.refine(sessionId, 'Add notifications');
    await h.service.refine(sessionId, 'Add reporting dashboards');

    const messages = await h.service.getMessages(sessionId);
    expect(messages).toHaveLength(4); // 2 turns × (user + assistant)
    expect(messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });
});
