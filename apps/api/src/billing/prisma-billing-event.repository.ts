import { Injectable } from '@nestjs/common';
import type { BillingEventType } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { BillingEvent } from './billing-event.entity';
import type {
  BillingEventRepository,
  CreateBillingEventInput,
} from './billing-event.repository';

/** PostgreSQL-backed billing-event store. */
@Injectable()
export class PrismaBillingEventRepository implements BillingEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBillingEventInput): Promise<void> {
    await this.prisma.billingEvent.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        note: input.note ?? null,
      },
    });
  }

  async findByUserId(userId: string, limit = 50): Promise<BillingEvent[]> {
    const rows = await this.prisma.billingEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapRow);
  }

  async findSince(since: Date): Promise<BillingEvent[]> {
    const rows = await this.prisma.billingEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapRow);
  }
}

function mapRow(r: {
  id: string;
  userId: string;
  actorId: string | null;
  type: string;
  note: string | null;
  createdAt: Date;
}): BillingEvent {
  return {
    id: r.id,
    userId: r.userId,
    actorId: r.actorId,
    type: r.type as BillingEventType,
    note: r.note,
    createdAt: r.createdAt,
  };
}
