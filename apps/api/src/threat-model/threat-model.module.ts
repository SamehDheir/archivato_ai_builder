import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { BillingModule } from '../billing/billing.module';
import { ThreatModelerAgent } from '../llm/agents/threat-modeler.agent';
import { ThreatModelController } from './threat-model.controller';
import { ThreatModelService } from './threat-model.service';
import { THREAT_MODEL_REPOSITORY } from './threat-model.repository';
import { PrismaThreatModelRepository } from './prisma-threat-model.repository';

@Module({
  // Pull in every upstream store needed to analyse the whole system.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    BillingModule,
  ],
  controllers: [ThreatModelController],
  providers: [
    ThreatModelService,
    ThreatModelerAgent,
    {
      provide: THREAT_MODEL_REPOSITORY,
      useClass: PrismaThreatModelRepository,
    },
  ],
  exports: [THREAT_MODEL_REPOSITORY, ThreatModelService],
})
export class ThreatModelModule {}
