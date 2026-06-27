import { Injectable } from '@nestjs/common';
import type { InterviewSession } from './interview-session.entity';
import type { InterviewSessionRepository } from './interview-session.repository';

/**
 * Process-local session store. Good enough to develop and demo the full flow
 * with zero database setup. Replaced by a Prisma-backed repository later.
 */
@Injectable()
export class InMemoryInterviewSessionRepository
  implements InterviewSessionRepository
{
  private readonly sessions = new Map<string, InterviewSession>();

  async create(session: InterviewSession): Promise<InterviewSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<InterviewSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async save(session: InterviewSession): Promise<InterviewSession> {
    session.updatedAt = new Date();
    this.sessions.set(session.id, session);
    return session;
  }
}
