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
}
