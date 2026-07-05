import type { WaitlistEntry } from './waitlist.entity';

/** DI token for the waitlist store. */
export const WAITLIST_REPOSITORY = Symbol('WAITLIST_REPOSITORY');

/** Fields needed to create a waitlist entry (id/timestamp assigned by the store). */
export interface CreateWaitlistEntryInput {
  email: string;
  locale?: string | null;
  source?: string | null;
}

/**
 * Persistence seam for waitlist signups (Repository pattern — project rule). The
 * in-memory impl backs the unit tests; the Prisma impl backs the running app.
 */
export interface WaitlistRepository {
  findByEmail(email: string): Promise<WaitlistEntry | null>;
  create(input: CreateWaitlistEntryInput): Promise<WaitlistEntry>;
  count(): Promise<number>;
}
