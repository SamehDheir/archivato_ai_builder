import type { InterviewSession } from './interview-session.entity';

/** DI token for the interview session store. */
export const INTERVIEW_SESSION_REPOSITORY = Symbol(
  'INTERVIEW_SESSION_REPOSITORY',
);

/**
 * Persistence seam for interview sessions (Repository pattern — project rule).
 * Swapped from in-memory to Prisma/Postgres in the persistence slice without
 * touching InterviewService.
 */
export interface InterviewSessionRepository {
  create(session: InterviewSession): Promise<InterviewSession>;
  findById(id: string): Promise<InterviewSession | null>;
  save(session: InterviewSession): Promise<InterviewSession>;
  /** All sessions owned by a user, most recently updated first ("my projects"). */
  findByUserId(userId: string): Promise<InterviewSession[]>;
  /** How many projects a user owns (support context; NOT the plan quota). */
  countByUserId(userId: string): Promise<number>;
  /**
   * How many projects a user CREATED since `since` — the plan quota's meter,
   * which is a rate per calendar month rather than a count of projects owned
   * (so deleting a project does not free the current period's slot).
   */
  countByUserIdCreatedSince(userId: string, since: Date): Promise<number>;
  /** Delete a project and (via DB cascade) all of its artifacts. */
  delete(id: string): Promise<void>;
}
