import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import { SystemDesignController } from './system-design.controller';
import { SystemDesignService } from './system-design.service';
import { SYSTEM_DESIGN_REPOSITORY } from './system-design.repository';
import { InMemorySystemDesignRepository } from './in-memory-system-design.repository';

@Module({
  // Pull in the shared session + requirement stores from upstream stages.
  imports: [InterviewModule, RequirementsModule],
  controllers: [SystemDesignController],
  providers: [
    SystemDesignService,
    SystemArchitectAgent,
    {
      provide: SYSTEM_DESIGN_REPOSITORY,
      useClass: InMemorySystemDesignRepository,
    },
  ],
})
export class SystemDesignModule {}
