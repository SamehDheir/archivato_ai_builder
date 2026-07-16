import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { CostEstimateModule } from '../cost-estimate/cost-estimate.module';
import { BillingModule } from '../billing/billing.module';
import { ReviewerAgent } from '../llm/agents/reviewer.agent';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { REVIEW_REPORT_REPOSITORY } from './review-report.repository';
import { PrismaReviewReportRepository } from './prisma-review-report.repository';

@Module({
  // Pull in every upstream store needed to review the whole system.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    CostEstimateModule,
    BillingModule,
  ],
  controllers: [ReviewController],
  providers: [
    ReviewService,
    ReviewerAgent,
    {
      provide: REVIEW_REPORT_REPOSITORY,
      useClass: PrismaReviewReportRepository,
    },
  ],
  // Export the review store (Export stage) + the service (chat refinement).
  exports: [REVIEW_REPORT_REPOSITORY, ReviewService],
})
export class ReviewModule {}
