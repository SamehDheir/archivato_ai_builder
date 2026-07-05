import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BillingEvent } from './billing-event.entity';
import type {
  BillingEventRepository,
  CreateBillingEventInput,
} from './billing-event.repository';

/** In-memory billing-event store — used by unit tests (keeps them DB-free). */
@Injectable()
export class InMemoryBillingEventRepository implements BillingEventRepository {
  private readonly events: BillingEvent[] = [];

  async create(input: CreateBillingEventInput): Promise<void> {
    this.events.push({
      id: randomUUID(),
      userId: input.userId,
      actorId: input.actorId ?? null,
      type: input.type,
      note: input.note ?? null,
      createdAt: new Date(),
    });
  }

  async findByUserId(userId: string, limit = 50): Promise<BillingEvent[]> {
    return this.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async findSince(since: Date): Promise<BillingEvent[]> {
    return this.events
      .filter((e) => e.createdAt >= since)
      .map((e) => ({ ...e }));
  }
}
