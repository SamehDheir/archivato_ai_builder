import type { AnalyticsEventType } from '@archivato/shared';

/**
 * A persisted analytics event. Powers the superAdmin dashboard: anonymous
 * landing pageviews plus server-recorded product events (signup/login/generate).
 * `visitorId` is a cookie-scoped anonymous id (unique-visitor counts); `userId`
 * is set (loosely, no FK) for signed-in product events.
 */
export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  path: string | null;
  referrer: string | null;
  visitorId: string | null;
  userId: string | null;
  /** ISO-3166-1 alpha-2 country derived from the request, or null. */
  country: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}
