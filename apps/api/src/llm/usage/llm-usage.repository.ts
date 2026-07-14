import type { LlmUserSpend } from '@archivato/shared';
import type { LlmUsageRecord } from './llm-usage.entity';

/** DI token for the LLM usage store. */
export const LLM_USAGE_REPOSITORY = Symbol('LLM_USAGE_REPOSITORY');

/** Fields needed to record a call (id/timestamp assigned by the store). */
export type CreateLlmUsageInput = Omit<LlmUsageRecord, 'id' | 'createdAt'>;

/**
 * Persistence seam for LLM usage (Repository pattern). Aggregation happens in
 * `LlmUsageService` from `findSince`, so the in-memory impl and the Prisma impl
 * report identically without dialect-specific SQL (same trade-off as analytics).
 */
export interface LlmUsageRepository {
  create(input: CreateLlmUsageInput): Promise<void>;
  /** All calls at/after `since`, oldest first. */
  findSince(since: Date): Promise<LlmUsageRecord[]>;
  /**
   * Lifetime spend for each of `userIds` (users with no calls are simply absent).
   *
   * Unlike `findSince`, this aggregates in the STORE, not in JS: it backs a
   * paginated table, so pulling every row of a table that grows with paid work
   * just to sum 20 users would be the wrong shape from day one.
   */
  spendByUsers(userIds: string[]): Promise<LlmUserSpend[]>;
}
