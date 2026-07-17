import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { BillingModule } from '../billing/billing.module';
import { CostEstimateController } from './cost-estimate.controller';
import { CostEstimateService } from './cost-estimate.service';
import { COST_ESTIMATE_REPOSITORY } from './cost-estimate.repository';
import { PrismaCostEstimateRepository } from './prisma-cost-estimate.repository';

@Module({
  // Pull in the upstream stores the workload is derived from.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    BillingModule,
  ],
  controllers: [CostEstimateController],
  providers: [
    CostEstimateService,
    {
      provide: COST_ESTIMATE_REPOSITORY,
      useClass: PrismaCostEstimateRepository,
    },
  ],
  // Exported so version snapshot/restore can include the estimate later.
  exports: [COST_ESTIMATE_REPOSITORY, CostEstimateService],
})
export class CostEstimateModule {}
