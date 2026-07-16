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

  async findByUserId(userId: string): Promise<InterviewSession[]> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async countByUserId(userId: string): Promise<number> {
    let n = 0;
    for (const s of this.sessions.values()) if (s.userId === userId) n++;
    return n;
  }

  async countByUserIdCreatedSince(userId: string, since: Date): Promise<number> {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.createdAt.getTime() >= since.getTime()) n++;
    }
    return n;
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}
