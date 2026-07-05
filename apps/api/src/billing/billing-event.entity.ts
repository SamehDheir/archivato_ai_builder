import type { BillingEventType } from '@archivato/shared';

/** A persisted billing lifecycle event. Mapped onto `billing_events`. */
export interface BillingEvent {
  id: string;
  userId: string;
  actorId: string | null;
  type: BillingEventType;
  note: string | null;
  createdAt: Date;
}
