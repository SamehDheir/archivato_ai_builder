import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { BusinessAnalysisModule } from '../business-analysis/business-analysis.module';
import { ProductVisionModule } from '../product-vision/product-vision.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { ThreatModelModule } from '../threat-model/threat-model.module';
import { QaPlanModule } from '../qa-plan/qa-plan.module';
import { VersionsModule } from '../versions/versions.module';
import { BillingModule } from '../billing/billing.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

/**
 * Streaming (SSE) generation. Imports every stage module so the service can call
 * each stage's `generate()`; InterviewModule provides the ownership guard,
 * BillingModule the Pro gate, VersionsModule the snapshot, Analytics the
 * generate-event beacon.
 *
 * It reaches further than `JobsModule` on purpose: BullMQ runs the design chain
 * (the stages a version snapshot covers), while the stream also narrates the
 * five standalone LLM stages, which are slow enough to be worth watching and
 * were previously the only agents with no live feed at all.
 */
@Module({
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    BusinessAnalysisModule,
    ProductVisionModule,
    RoadmapModule,
    ThreatModelModule,
    QaPlanModule,
    VersionsModule,
    BillingModule,
    AnalyticsModule,
  ],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
