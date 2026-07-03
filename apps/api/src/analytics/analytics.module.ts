import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ANALYTICS_EVENT_REPOSITORY } from './analytics-event.repository';
import { PrismaAnalyticsEventRepository } from './prisma-analytics-event.repository';

/**
 * Analytics: records anonymous landing pageviews (public beacon) plus product
 * events (signup/login/generate, recorded server-side). Exports `AnalyticsService`
 * so the auth/jobs flows can record events and the admin module can aggregate.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    {
      provide: ANALYTICS_EVENT_REPOSITORY,
      useClass: PrismaAnalyticsEventRepository,
    },
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
