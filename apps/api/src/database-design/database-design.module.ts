import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import { DatabaseDesignController } from './database-design.controller';
import { DatabaseDesignService } from './database-design.service';
import { DATABASE_DESIGN_REPOSITORY } from './database-design.repository';
import { PrismaDatabaseDesignRepository } from './prisma-database-design.repository';

@Module({
  // Pull in the shared session + requirement + system-design stores upstream.
  imports: [InterviewModule, RequirementsModule, SystemDesignModule],
  controllers: [DatabaseDesignController],
  providers: [
    DatabaseDesignService,
    DatabaseDesignerAgent,
    {
      provide: DATABASE_DESIGN_REPOSITORY,
      useClass: PrismaDatabaseDesignRepository,
    },
  ],
  // Export the schema store so downstream stages (API Design) read it.
  exports: [DATABASE_DESIGN_REPOSITORY],
})
export class DatabaseDesignModule {}
