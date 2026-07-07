import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Subscription } from './subscription.entity';
import type {
  CreateSubscriptionInput,
  SubscriptionRepository,
} from './subscription.repository';

/** In-memory subscription store — used by unit tests. */
@Injectable()
export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly subs = new Map<string, Subscription>();

  async findByUserId(userId: string): Promise<Subscription | null> {
    for (const s of this.subs.values()) {
      if (s.userId === userId) return { ...s };
    }
    return null;
  }

  async findByPaddleSubscriptionId(id: string): Promise<Subscription | null> {
    for (const s of this.subs.values()) {
      if (s.paddleSubscriptionId === id) return { ...s };
    }
    return null;
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const now = new Date();
    const sub: Subscription = {
      id: randomUUID(),
      userId: input.userId,
      plan: input.plan ?? 'free',
      status: input.status ?? 'active',
      billingCycle: 'monthly',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      paddleCustomerId: null,
      paddleSubscriptionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.subs.set(sub.id, sub);
    return { ...sub };
  }

  async save(subscription: Subscription): Promise<Subscription> {
    const next: Subscription = { ...subscription, updatedAt: new Date() };
    this.subs.set(next.id, next);
    return { ...next };
  }
}
