import { Injectable } from '@nestjs/common';
import type { AnalyticsEventType } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsEvent } from './analytics-event.entity';
import type {
  AnalyticsEventRepository,
  CreateAnalyticsEventInput,
} from './analytics-event.repository';

/** PostgreSQL-backed analytics event store. */
@Injectable()
export class PrismaAnalyticsEventRepository
  implements AnalyticsEventRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAnalyticsEventInput): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: {
        type: input.type,
        path: input.path ?? null,
        referrer: input.referrer ?? null,
        visitorId: input.visitorId ?? null,
        userId: input.userId ?? null,
        // Only set the Json column when we actually have metadata.
        meta: (input.meta as object) ?? undefined,
      },
    });
  }

  async countByType(type: AnalyticsEventType): Promise<number> {
    return this.prisma.analyticsEvent.count({ where: { type } });
  }

  async findSince(since: Date): Promise<AnalyticsEvent[]> {
    const rows = await this.prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type as AnalyticsEventType,
      path: r.path,
      referrer: r.referrer,
      visitorId: r.visitorId,
      userId: r.userId,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt,
    }));
  }
}
