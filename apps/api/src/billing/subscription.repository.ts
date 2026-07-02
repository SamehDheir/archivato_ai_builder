import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@archivato/shared';
import type { Subscription } from './subscription.entity';

/** DI token for the subscription store. */
export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

/** Fields to create a subscription (defaults to a free/active plan). */
export interface CreateSubscriptionInput {
  userId: string;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
}

/**
 * Persistence seam for subscriptions (Repository pattern — project rule).
 * In-memory impl backs the unit tests; the Prisma impl backs the running app.
 */
export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;
  findByPaddleSubscriptionId(id: string): Promise<Subscription | null>;
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  save(subscription: Subscription): Promise<Subscription>;
}
