import { Injectable } from '@nestjs/common';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Subscription } from './subscription.entity';
import type {
  CreateSubscriptionInput,
  SubscriptionRepository,
} from './subscription.repository';

/** PostgreSQL-backed subscription store. */
@Injectable()
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({ where: { userId } });
    return row ? toEntity(row) : null;
  }

  async findByPaddleSubscriptionId(id: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({
      where: { paddleSubscriptionId: id },
    });
    return row ? toEntity(row) : null;
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const row = await this.prisma.subscription.create({
      data: {
        userId: input.userId,
        plan: input.plan ?? 'free',
        status: input.status ?? 'active',
      },
    });
    return toEntity(row);
  }

  async save(subscription: Subscription): Promise<Subscription> {
    const row = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        paddleCustomerId: subscription.paddleCustomerId,
        paddleSubscriptionId: subscription.paddleSubscriptionId,
      },
    });
    return toEntity(row);
  }
}

function toEntity(row: {
  id: string;
  userId: string;
  plan: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    plan: row.plan as SubscriptionPlan,
    status: row.status as SubscriptionStatus,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    paddleCustomerId: row.paddleCustomerId,
    paddleSubscriptionId: row.paddleSubscriptionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
