import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';
import { PROJECT_VERSION_REPOSITORY } from './project-version.repository';
import { PrismaProjectVersionRepository } from './prisma-project-version.repository';

/**
 * Project version history (Slice 12). Imports every artifact module so the
 * service can read all artifacts (to snapshot) and write them (to restore).
 * Exports VersionsService so the job worker and chat refinement can record a
 * version after each modification.
 */
@Module({
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
  ],
  controllers: [VersionsController],
  providers: [
    VersionsService,
    {
      provide: PROJECT_VERSION_REPOSITORY,
      useClass: PrismaProjectVersionRepository,
    },
  ],
  exports: [VersionsService],
})
export class VersionsModule {}
