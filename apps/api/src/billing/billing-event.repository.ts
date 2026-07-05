import type { BillingEventType } from '@archivato/shared';
import type { BillingEvent } from './billing-event.entity';

/** DI token for the billing-event store. */
export const BILLING_EVENT_REPOSITORY = Symbol('BILLING_EVENT_REPOSITORY');

/** Fields to record a billing event (id/timestamp assigned by the store). */
export interface CreateBillingEventInput {
  userId: string;
  actorId?: string | null;
  type: BillingEventType;
  note?: string | null;
}

/**
 * Append-only audit store for billing events (Repository pattern). In-memory
 * impl backs the unit tests; the Prisma impl backs the running app.
 */
export interface BillingEventRepository {
  create(input: CreateBillingEventInput): Promise<void>;
  /** A user's events, newest first (capped by `limit`). */
  findByUserId(userId: string, limit?: number): Promise<BillingEvent[]>;
  /** All events since `since` (for the trends chart). */
  findSince(since: Date): Promise<BillingEvent[]>;
}
