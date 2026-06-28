import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
import { ApiDesignController } from './api-design.controller';
import { ApiDesignService } from './api-design.service';
import { API_DESIGN_REPOSITORY } from './api-design.repository';
import { PrismaApiDesignRepository } from './prisma-api-design.repository';

@Module({
  // Pull in every upstream store needed to design the API.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
  ],
  controllers: [ApiDesignController],
  providers: [
    ApiDesignService,
    ApiDesignerAgent,
    {
      provide: API_DESIGN_REPOSITORY,
      useClass: PrismaApiDesignRepository,
    },
  ],
  // Export the API design store so the Review stage can read it.
  exports: [API_DESIGN_REPOSITORY],
})
export class ApiDesignModule {}
