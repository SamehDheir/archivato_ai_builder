import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { ShareModule } from '../share/share.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * A read-only view over stores that other modules own — the AdminService/read-model
 * precedent, but through the repository interfaces rather than Prisma, so it stays
 * unit-testable against the in-memory implementations.
 *
 * It imports *downward* (interview + the design stores + share). The reverse —
 * teaching `InterviewModule` about the designs — is impossible: every design module
 * already imports it for the session repo and `SessionOwnerGuard`, so it would be a
 * cycle.
 */
@Module({
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    // For the share-link repository token only — "has this been sent to the
    // client?" is a fact about the project, and it's the one the card leads with.
    ShareModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
