import { HttpException } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { BillingService } from '../billing/billing.service';

const IDEA = { idea: 'A clinic management system with appointments and billing' };
const USER = 'user-1';

/** A billing stub on a fixed plan quota (`null` = the unlimited Team plan). */
function billingOn(quota: number | null): BillingService {
  return { getProjectQuota: async () => quota } as unknown as BillingService;
}

function makeService(quota: number | null): {
  service: InterviewService;
  repo: InMemoryInterviewSessionRepository;
} {
  const mock = new MockLlmProvider();
  const repo = new InMemoryInterviewSessionRepository();
  const service = new InterviewService(
    repo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
    billingOn(quota),
  );
  return { service, repo };
}

/** Rewind a session's creation date, as if it were started in a past month. */
async function backdate(
  repo: InMemoryInterviewSessionRepository,
  sessionId: string,
  createdAt: Date,
): Promise<void> {
  const session = await repo.findById(sessionId);
  await repo.save({ ...session!, createdAt });
}

describe('project quota (Starter = 1 design per month)', () => {
  it('allows the first design of the month', async () => {
    const { service } = makeService(1);
    await expect(service.start(IDEA, USER)).resolves.toBeTruthy();
  });

  it('402s a second design in the same month', async () => {
    const { service } = makeService(1);
    await service.start(IDEA, USER);

    await expect(service.start(IDEA, USER)).rejects.toMatchObject({
      response: { code: 'quota_exceeded' },
    });
    await expect(service.start(IDEA, USER)).rejects.toBeInstanceOf(HttpException);
  });

  // The allowance is per calendar month, so last month's design must not be held
  // against this month — that is the whole difference from a lifetime cap.
  it('lets the allowance reset: last month’s design does not count', async () => {
    const { service, repo } = makeService(1);
    const { sessionId } = await service.start(IDEA, USER);
    await backdate(repo, sessionId, new Date('2020-01-15T00:00:00Z'));

    await expect(service.start(IDEA, USER)).resolves.toBeTruthy();
  });

  it('meters per user, not globally', async () => {
    const { service } = makeService(1);
    await service.start(IDEA, USER);
    await expect(service.start(IDEA, 'user-2')).resolves.toBeTruthy();
  });

  it('never meters an owner-less session (the state-machine tests)', async () => {
    const { service } = makeService(1);
    await service.start(IDEA, null);
    await expect(service.start(IDEA, null)).resolves.toBeTruthy();
  });
});

describe('project quota (Team = unlimited)', () => {
  it('skips the check entirely — no cap, no 402', async () => {
    const { service } = makeService(null);
    for (let i = 0; i < 8; i++) {
      await expect(service.start(IDEA, USER)).resolves.toBeTruthy();
    }
  });
});

/**
 * **A known, accepted hole.** The meter is the project list itself (there is no
 * usage table by design), so a deleted project stops being counted and a Starter
 * user can delete-and-retry within the same month. It is not a regression — the
 * old owned-count quota behaved identically — and it costs the user the design
 * they delete, so it buys them nothing but a re-run. Closing it would mean
 * recording creations somewhere that survives the delete (a usage counter or a
 * soft delete), which is a store this project deliberately does not have.
 *
 * Pinned as a test so the behaviour is a decision on record rather than a
 * surprise the next person discovers in production.
 */
describe('project quota — the delete-and-retry hole', () => {
  it('frees the month’s slot when the project is deleted', async () => {
    const { service } = makeService(1);
    const { sessionId } = await service.start(IDEA, USER);
    await expect(service.start(IDEA, USER)).rejects.toBeInstanceOf(HttpException);

    await service.deleteProject(sessionId);

    await expect(service.start(IDEA, USER)).resolves.toBeTruthy();
  });
});
