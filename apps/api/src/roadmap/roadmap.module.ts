import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { RoadmapPlannerAgent } from '../llm/agents/roadmap-planner.agent';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';
import { PROJECT_ROADMAP_REPOSITORY } from './roadmap.repository';
import { PrismaProjectRoadmapRepository } from './prisma-roadmap.repository';

@Module({
  // Pull in every upstream store needed to sequence the whole system.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
  ],
  controllers: [RoadmapController],
  providers: [
    RoadmapService,
    RoadmapPlannerAgent,
    {
      provide: PROJECT_ROADMAP_REPOSITORY,
      useClass: PrismaProjectRoadmapRepository,
    },
  ],
  // Exported so version snapshot/restore can include the roadmap later.
  exports: [PROJECT_ROADMAP_REPOSITORY, RoadmapService],
})
export class RoadmapModule {}
