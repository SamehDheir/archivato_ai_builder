import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PROPOSAL_DRAFT_LIMIT } from '@archivato/shared';
import { ProposalService } from './proposal.service';
import { ProposalWriterAgent } from '../llm/agents/proposal-writer.agent';
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
import { InMemoryProjectRoadmapRepository } from '../roadmap/in-memory-roadmap.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { ArchitectExplainerAgent } from '../llm/agents/architect-explainer.agent';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from '../interview/question-plan';
import type { ShareService } from '../share/share.service';

const IDEA = {
  idea: 'A clinic system with appointments, billing, notifications and reports',
};
const WEB_ORIGIN = 'https://archivato.dev';
const TOKEN = 'tok_abc123';

interface Harness {
  interview: InterviewService;
  requirements: RequirementsService;
  systemDesign: SystemDesignService;
  databaseDesign: DatabaseDesignService;
  apiDesign: ApiDesignService;
  service: ProposalService;
  sessions: InMemoryInterviewSessionRepository;
  shareCreate: jest.Mock;
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

  // `create` is idempotent in the real service; here we only care THAT it is
  // called, and with what.
  const shareCreate = jest.fn().mockResolvedValue({
    token: TOKEN,
    createdAt: new Date().toISOString(),
    viewCount: 0,
  });

  const service = new ProposalService(
    sessionRepo,
    docRepo,
    sysRepo,
    apiRepo,
    roadmapRepo,
    { create: shareCreate } as unknown as ShareService,
    new ProposalWriterAgent(mock),
    { get: (_k: string, d: string) => WEB_ORIGIN ?? d } as unknown as ConfigService,
  );

  return {
    interview,
    requirements,
    systemDesign,
    databaseDesign,
    apiDesign,
    service,
    sessions: sessionRepo,
    shareCreate,
  };
}

/** Run the whole pipeline through the API design — the proposal's floor. */
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

describe('ProposalService', () => {
  describe('gating', () => {
    it('404s an unknown session', async () => {
      const h = makeHarness();
      await expect(
        h.service.generate('nope', { channel: 'upwork' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s before the interview is confirmed', async () => {
      const h = makeHarness();
      const { sessionId } = await h.interview.start(IDEA);

      await expect(
        h.service.generate(sessionId, { channel: 'upwork' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('409s until the API design exists — a message is only as good as its scoping', async () => {
      const h = makeHarness();
      const { sessionId } = await h.interview.start(IDEA);
      for (let i = 0; i < TOTAL_QUESTIONS; i++) {
        const state = await h.interview.getState(sessionId);
        if (state.status !== 'collecting') break;
        await h.interview.answer(sessionId, 'payments billing');
      }
      await h.interview.confirm(sessionId);
      await h.requirements.generate(sessionId);
      await h.systemDesign.generate(sessionId);

      await expect(
        h.service.generate(sessionId, { channel: 'upwork' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('generate', () => {
    it('produces a sendable draft carrying the share link', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      const draft = await h.service.generate(sessionId, { channel: 'upwork' });

      expect(draft.shareUrl).toBe(`${WEB_ORIGIN}/s/${TOKEN}`);
      expect(draft.message).toContain(draft.shareUrl);
      expect(draft.channel).toBe('upwork');
      expect(draft.charCount).toBeGreaterThan(0);
      expect(draft.overLength).toBe(false);
      expect(draft.includedPrice).toBe(false);
    });

    it('mints the link through the idempotent create, not a fresh token', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      await h.service.generate(sessionId, { channel: 'upwork' });
      await h.service.generate(sessionId, { channel: 'upwork', variant: 1 });

      // Both went through `create`, which returns the SAME link — so writing a
      // second message never rotates a link already sitting in a client's inbox.
      expect(h.shareCreate).toHaveBeenCalledTimes(2);
      expect(h.shareCreate).toHaveBeenCalledWith(sessionId);
    });

    it('resolves the language from the channel (Mostaql ⇒ Arabic)', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      const ar = await h.service.generate(sessionId, { channel: 'mostaql' });
      const en = await h.service.generate(sessionId, { channel: 'upwork' });

      expect(ar.locale).toBe('ar');
      expect(en.locale).toBe('en');
    });

    it('drops the price when the owner did not opt in, even if one was sent', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      // A figure left behind in the form after unticking the box.
      const draft = await h.service.generate(sessionId, {
        channel: 'upwork',
        includePrice: false,
        price: '$9,999',
      });

      expect(draft.includedPrice).toBe(false);
      expect(draft.message).not.toContain('9,999');
    });

    it('states the price verbatim when the owner did opt in', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      const draft = await h.service.generate(sessionId, {
        channel: 'upwork',
        includePrice: true,
        price: '$6,000 – $9,000',
      });

      expect(draft.includedPrice).toBe(true);
      expect(draft.message).toContain('$6,000 – $9,000');
    });
  });

  describe('draft history', () => {
    it('persists drafts on the session, newest first', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      await h.service.generate(sessionId, { channel: 'upwork' });
      const second = await h.service.generate(sessionId, {
        channel: 'mostaql',
        variant: 1,
      });

      const history = await h.service.history(sessionId);
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(second.id);

      // …and it really is on the session row, not just in the service's head.
      const session = await h.sessions.findById(sessionId);
      expect(session!.proposalDrafts).toHaveLength(2);
    });

    it(`caps the stored history at ${PROPOSAL_DRAFT_LIMIT}`, async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      for (let i = 0; i < PROPOSAL_DRAFT_LIMIT + 3; i++) {
        await h.service.generate(sessionId, { channel: 'upwork', variant: i });
      }

      const history = await h.service.history(sessionId);
      expect(history).toHaveLength(PROPOSAL_DRAFT_LIMIT);

      const session = await h.sessions.findById(sessionId);
      expect(session!.proposalDrafts).toHaveLength(PROPOSAL_DRAFT_LIMIT);
    });

    it('is empty for a project that never wrote one', async () => {
      const h = makeHarness();
      const sessionId = await pipeline(h);

      expect(await h.service.history(sessionId)).toEqual([]);
    });

    it('does not clobber a session change made while the model was writing', async () => {
      // `save()` persists the whole row, and the model call is the longest window
      // in the app. If the service wrote back the snapshot it read before that
      // call, anything the owner changed meanwhile — a rename, a weekly rate, a
      // review fix — would silently revert.
      const h = makeHarness();
      const sessionId = await pipeline(h);

      const writer: ProposalWriterAgent = (
        h.service as unknown as { writer: ProposalWriterAgent }
      ).writer;
      jest.spyOn(writer, 'write').mockImplementation(async () => {
        // A concurrent PATCH /interview/:id landing mid-generation.
        const concurrent = await h.sessions.findById(sessionId);
        await h.sessions.save({
          ...concurrent!,
          title: 'Renamed mid-flight',
          weeklyRate: 2500,
        });
        return { message: `Hi. ${WEB_ORIGIN}/s/${TOKEN} What first?`, source: 'llm' };
      });

      await h.service.generate(sessionId, { channel: 'upwork' });

      const session = await h.sessions.findById(sessionId);
      expect(session!.title).toBe('Renamed mid-flight');
      expect(session!.weeklyRate).toBe(2500);
      // …and the draft still landed.
      expect(session!.proposalDrafts).toHaveLength(1);
    });
  });
});
