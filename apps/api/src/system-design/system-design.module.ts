import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { SystemDesignController } from './system-design.controller';
import { SystemDesignService } from './system-design.service';
import { SYSTEM_DESIGN_REPOSITORY } from './system-design.repository';
import { PrismaSystemDesignRepository } from './prisma-system-design.repository';

@Module({
  // Pull in the shared session + requirement stores from upstream stages.
  imports: [InterviewModule, RequirementsModule],
  controllers: [SystemDesignController],
  providers: [
    SystemDesignService,
    SystemArchitectAgent,
    {
      provide: SYSTEM_DESIGN_REPOSITORY,
      useClass: PrismaSystemDesignRepository,
    },
  ],
  // Export the design store so downstream stages (Database Design) read it.
  exports: [SYSTEM_DESIGN_REPOSITORY],
})
export class SystemDesignModule {}
