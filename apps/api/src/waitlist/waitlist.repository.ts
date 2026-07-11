import type { WaitlistEntry } from './waitlist.entity';

/** DI token for the waitlist store. */
export const WAITLIST_REPOSITORY = Symbol('WAITLIST_REPOSITORY');

/** Fields needed to create a waitlist entry (id/timestamp assigned by the store). */
export interface CreateWaitlistEntryInput {
  email: string;
  locale?: string | null;
  source?: string | null;
  /** ISO-3166-1 alpha-2 country derived server-side from the request, or null. */
  country?: string | null;
}

/**
 * Persistence seam for waitlist signups (Repository pattern — project rule). The
 * in-memory impl backs the unit tests; the Prisma impl backs the running app.
 */
/** Filter/page params for the admin list. `q` matches email/source (contains). */
export interface ListWaitlistParams {
  q?: string;
  skip: number;
  take: number;
}

export interface WaitlistRepository {
  findByEmail(email: string): Promise<WaitlistEntry | null>;
  create(input: CreateWaitlistEntryInput): Promise<WaitlistEntry>;
  count(): Promise<number>;
  /** Newest-first page of entries matching `q`, plus the total match count. */
  list(
    params: ListWaitlistParams,
  ): Promise<{ entries: WaitlistEntry[]; total: number }>;
}
