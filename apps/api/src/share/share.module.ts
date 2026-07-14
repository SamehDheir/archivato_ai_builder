import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { ProductVisionModule } from '../product-vision/product-vision.module';
import { CostEstimateModule } from '../cost-estimate/cost-estimate.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { ShareController } from './share.controller';
import { SharePublicController } from './share-public.controller';
import { ShareService } from './share.service';
import { SHARE_LINK_REPOSITORY } from './share-link.repository';
import { PrismaShareLinkRepository } from './prisma-share-link.repository';

@Module({
  // The upstream design stores, read directly (the roadmap/cost precedent).
  //
  // Share used to lean on ExportModule for both the artifacts and the gate, but
  // export's gate is "complete through the API design" — a Pro stage. Sharing is
  // free on every plan, so it owns its own (lower) gate and no longer depends on
  // export. BillingModule is gone with the ProGuard.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    // The client-facing artifacts the shared page now leads with. Read-only, and
    // never part of the gate: a link is shareable without them (a free owner has
    // no cost estimate or roadmap), the page just omits those sections.
    ProductVisionModule,
    CostEstimateModule,
    RoadmapModule,
  ],
  controllers: [ShareController, SharePublicController],
  providers: [
    ShareService,
    { provide: SHARE_LINK_REPOSITORY, useClass: PrismaShareLinkRepository },
  ],
  exports: [ShareService],
})
export class ShareModule {}
