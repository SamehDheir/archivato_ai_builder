import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { VersionsModule } from '../versions/versions.module';
import { BillingModule } from '../billing/billing.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

/**
 * Streaming (SSE) pipeline generation. Imports every stage module so the service
 * can call each stage's `generate()`; InterviewModule provides the ownership
 * guard, BillingModule the Pro gate, VersionsModule the snapshot, Analytics the
 * generate-event beacon. Mirrors `JobsModule`'s dependencies minus BullMQ.
 */
@Module({
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    VersionsModule,
    BillingModule,
    AnalyticsModule,
  ],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
