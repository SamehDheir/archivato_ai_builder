import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { BillingModule } from '../billing/billing.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportAnalyticsInterceptor } from './export-analytics.interceptor';

@Module({
  // Pull in every upstream store to assemble the export bundle.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    BillingModule,
    // Read-only, and never a gate: the export routes record the funnel's final
    // step (see ExportAnalyticsInterceptor).
    AnalyticsModule,
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportAnalyticsInterceptor],
  // Exported so the scaffold module can reuse the assembled design bundle
  // (and its "pipeline complete through API design" gate).
  exports: [ExportService],
})
export class ExportModule {}
