import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@archivato/shared';

/** A persisted subscription (one per user). Mapped onto the `subscriptions` table. */
export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
