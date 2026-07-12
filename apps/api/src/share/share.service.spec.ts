import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShareService } from './share.service';
import { InMemoryShareLinkRepository } from './in-memory-share-link.repository';
import { ExportService } from '../export/export.service';
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
  sessions: InMemoryInterviewSessionRepository;
  apiDesigns: InMemoryApiDesignRepository;
  share: ShareService;
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
  const exports = new ExportService(
    sessionRepo,
    docRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    reviewRepo,
  );
  const share = new ShareService(
    new InMemoryShareLinkRepository(),
    sessionRepo,
    exports,
  );
  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    sessions: sessionRepo,
    apiDesigns: apiRepo,
    share,
  };
}

/** Drive the interview to `confirmed` without generating any design. */
async function confirmedSession(h: Harness): Promise<string> {
  const { sessionId } = await h.interview.start(IDEA);
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await h.interview.getState(sessionId);
    if (state.status !== 'collecting') break;
    await h.interview.answer(sessionId, 'payments billing notifications reports');
  }
  await h.interview.confirm(sessionId);
  return sessionId;
}

async function fullPipeline(h: Harness): Promise<string> {
  const sessionId = await confirmedSession(h);
  await h.requirements.generate(sessionId);
  await h.systemDesign.generate(sessionId);
  await h.databaseDesign.generate(sessionId);
  await h.apiDesign.generate(sessionId);
  return sessionId;
}

describe('ShareService', () => {
  it('reports no link for an unshared session', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    await expect(h.share.get(sessionId)).resolves.toBeNull();
  });

  it('refuses to share a design that is not complete through the API design', async () => {
    const h = makeHarness();
    const sessionId = await confirmedSession(h);
    await h.requirements.generate(sessionId);
    // No system/database/API design yet.
    await expect(h.share.create(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(h.share.get(sessionId)).resolves.toBeNull();
  });

  it('mints an unguessable token and is idempotent', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);

    const link = await h.share.create(sessionId);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(link.viewCount).toBe(0);

    // Sharing again must not invalidate a link the owner already sent out.
    const again = await h.share.create(sessionId);
    expect(again.token).toBe(link.token);
  });

  it('two sessions never share a token', async () => {
    const h = makeHarness();
    const a = await h.share.create(await fullPipeline(h));
    const b = await h.share.create(await fullPipeline(h));
    expect(a.token).not.toBe(b.token);
  });

  it('serves the design by token and counts the view', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    const shared = await h.share.view(token);
    expect(shared.token).toBe(token);
    expect(shared.title).toBe(IDEA.idea); // untitled project falls back to the idea
    expect(shared.systemDesign.services.length).toBeGreaterThan(0);
    expect(shared.apiDesign.modules.length).toBeGreaterThan(0);
    expect(shared.review).toBeNull(); // review was never run

    // The public payload must not carry the session id or the owner.
    expect(JSON.stringify(shared)).not.toContain(sessionId);
    expect(shared).not.toHaveProperty('sessionId');
    expect(shared).not.toHaveProperty('userId');

    await h.share.view(token);
    const link = await h.share.get(sessionId);
    expect(link?.viewCount).toBe(2);
  });

  it('prefers the owner-set title over the raw idea', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const session = await h.sessions.findById(sessionId);
    await h.sessions.save({ ...session!, title: 'Clinic OS' });

    const { token } = await h.share.create(sessionId);
    await expect(h.share.view(token)).resolves.toMatchObject({
      title: 'Clinic OS',
    });
  });

  it('404s an unknown token', async () => {
    const h = makeHarness();
    await expect(h.share.view('not-a-real-token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s a revoked token, and re-sharing mints a fresh one', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    await h.share.revoke(sessionId);
    await expect(h.share.view(token)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.share.get(sessionId)).resolves.toBeNull();

    const fresh = await h.share.create(sessionId);
    expect(fresh.token).not.toBe(token);
    // The old link stays dead.
    await expect(h.share.view(token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s (not 409s) a link whose design regressed', async () => {
    const h = makeHarness();
    const sessionId = await fullPipeline(h);
    const { token } = await h.share.create(sessionId);

    // e.g. a version restore dropped the API design out from under the link.
    await h.apiDesigns.deleteBySessionId(sessionId);

    await expect(h.share.view(token)).rejects.toBeInstanceOf(NotFoundException);
  });
});
