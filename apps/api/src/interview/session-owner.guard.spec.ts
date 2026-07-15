import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SessionOwnerGuard } from './session-owner.guard';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import type { InterviewSession } from './interview-session.entity';

function ctxFor(
  user: { id: string } | undefined,
  params: Record<string, string>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
}

function seed(
  repo: InMemoryInterviewSessionRepository,
  id: string,
  userId: string | null,
): Promise<InterviewSession> {
  const now = new Date();
  return repo.create({
    id,
    userId,
    input: { idea: 'idea' },
    title: null,
    clientName: null,
    status: 'collecting',
    intent: null,
    history: [],
    pendingQuestion: null,
    coverage: 0,
    summary: null,
    slots: null,
    openQuestions: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('SessionOwnerGuard', () => {
  let repo: InMemoryInterviewSessionRepository;
  let guard: SessionOwnerGuard;

  beforeEach(() => {
    repo = new InMemoryInterviewSessionRepository();
    guard = new SessionOwnerGuard(repo);
  });

  it('allows the owner through (sessionId param)', async () => {
    await seed(repo, 's1', 'user-1');
    await expect(
      guard.canActivate(ctxFor({ id: 'user-1' }, { sessionId: 's1' })),
    ).resolves.toBe(true);
  });

  it('allows the owner through (interview :id param)', async () => {
    await seed(repo, 's1', 'user-1');
    await expect(
      guard.canActivate(ctxFor({ id: 'user-1' }, { id: 's1' })),
    ).resolves.toBe(true);
  });

  it('404s for a non-owner (no existence leak)', async () => {
    await seed(repo, 's1', 'user-1');
    await expect(
      guard.canActivate(ctxFor({ id: 'attacker' }, { sessionId: 's1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s for an unknown session', async () => {
    await expect(
      guard.canActivate(ctxFor({ id: 'user-1' }, { sessionId: 'nope' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when no user is present', async () => {
    await expect(
      guard.canActivate(ctxFor(undefined, { sessionId: 's1' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
