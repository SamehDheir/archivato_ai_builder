import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AnalyticsEventType } from '@archivato/shared';
import type { AnalyticsEvent } from './analytics-event.entity';
import type {
  AnalyticsEventRepository,
  CreateAnalyticsEventInput,
} from './analytics-event.repository';

/** In-memory analytics store — used by unit tests (keeps them DB-free). */
@Injectable()
export class InMemoryAnalyticsEventRepository
  implements AnalyticsEventRepository
{
  private readonly events: AnalyticsEvent[] = [];

  async create(input: CreateAnalyticsEventInput): Promise<void> {
    this.events.push({
      id: randomUUID(),
      type: input.type,
      path: input.path ?? null,
      referrer: input.referrer ?? null,
      visitorId: input.visitorId ?? null,
      userId: input.userId ?? null,
      meta: input.meta ?? null,
      createdAt: new Date(),
    });
  }

  async countByType(type: AnalyticsEventType): Promise<number> {
    return this.events.filter((e) => e.type === type).length;
  }

  async findSince(since: Date): Promise<AnalyticsEvent[]> {
    return this.events
      .filter((e) => e.createdAt >= since)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }
}
