import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { BillingModule } from '../billing/billing.module';
import { QaPlannerAgent } from '../llm/agents/qa-planner.agent';
import { QaPlanController } from './qa-plan.controller';
import { QaPlanService } from './qa-plan.service';
import { QA_PLAN_REPOSITORY } from './qa-plan.repository';
import { PrismaQaPlanRepository } from './prisma-qa-plan.repository';

@Module({
  // Pull in every upstream store needed to plan tests for the whole system.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    BillingModule,
  ],
  controllers: [QaPlanController],
  providers: [
    QaPlanService,
    QaPlannerAgent,
    {
      provide: QA_PLAN_REPOSITORY,
      useClass: PrismaQaPlanRepository,
    },
  ],
  exports: [QA_PLAN_REPOSITORY, QaPlanService],
})
export class QaPlanModule {}
