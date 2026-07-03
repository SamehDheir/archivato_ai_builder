import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AnalyticsEventType } from '@archivato/shared';
import type { AnalyticsEvent } from './analytics-event.entity';
import {
  ANALYTICS_EVENT_REPOSITORY,
  type AnalyticsEventRepository,
  type CreateAnalyticsEventInput,
} from './analytics-event.repository';

/**
 * Records analytics events and exposes read helpers for the admin dashboard.
 * Product events (signup/login/generate) call `recordSafe` so a tracking failure
 * never breaks the main flow; the aggregation itself lives in `AdminService`.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(ANALYTICS_EVENT_REPOSITORY)
    private readonly repo: AnalyticsEventRepository,
  ) {}

  /** Record an event; throws on failure (used by the tracking endpoint). */
  record(input: CreateAnalyticsEventInput): Promise<void> {
    return this.repo.create(input);
  }

  /** Best-effort record — swallows errors so it can't break the caller's flow. */
  async recordSafe(input: CreateAnalyticsEventInput): Promise<void> {
    try {
      await this.repo.create(input);
    } catch (err) {
      this.logger.warn(`Failed to record ${input.type} event: ${err}`);
    }
  }

  countByType(type: AnalyticsEventType): Promise<number> {
    return this.repo.countByType(type);
  }

  findSince(since: Date): Promise<AnalyticsEvent[]> {
    return this.repo.findSince(since);
  }
}
