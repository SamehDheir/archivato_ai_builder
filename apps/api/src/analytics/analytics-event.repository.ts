import type { AnalyticsEventType } from '@archivato/shared';
import type { AnalyticsEvent } from './analytics-event.entity';

/** DI token for the analytics event store. */
export const ANALYTICS_EVENT_REPOSITORY = Symbol('ANALYTICS_EVENT_REPOSITORY');

/** Fields needed to record an event (id/timestamp assigned by the store). */
export interface CreateAnalyticsEventInput {
  type: AnalyticsEventType;
  path?: string | null;
  referrer?: string | null;
  visitorId?: string | null;
  userId?: string | null;
  /** ISO-3166-1 alpha-2 country derived from the request, or null. */
  country?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Persistence seam for analytics events (Repository pattern). Aggregation is done
 * in the service/admin layer from `findSince` (bucketed in JS) so the in-memory
 * impl and the Prisma impl behave identically without dialect-specific SQL.
 */
export interface AnalyticsEventRepository {
  create(input: CreateAnalyticsEventInput): Promise<void>;
  /** Total events of a type (all time). */
  countByType(type: AnalyticsEventType): Promise<number>;
  /** All events at/after `since`, oldest first (for time-series aggregation). */
  findSince(since: Date): Promise<AnalyticsEvent[]>;
}
