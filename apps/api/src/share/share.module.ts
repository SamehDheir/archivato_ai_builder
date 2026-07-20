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
import { ThreatModelModule } from '../threat-model/threat-model.module';
import { QaPlanModule } from '../qa-plan/qa-plan.module';
import { BillingModule } from '../billing/billing.module';
import { AnalyticsModule } from '../analytics/analytics.module';
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
  // export.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    // The client-facing artifacts the shared page now leads with, plus the two
    // that close the technical appendix. Read-only, and never part of the gate: a
    // link is shareable without them (a free owner has no cost estimate, roadmap,
    // threat model or QA plan), the page just omits those sections.
    ProductVisionModule,
    CostEstimateModule,
    RoadmapModule,
    ThreatModelModule,
    QaPlanModule,
    // Billing is back — but ONLY to read the owner's plan for the watermark, and
    // never to gate the route (there is no `ProGuard` on sharing, deliberately;
    // see ShareController). A read, not a wall.
    BillingModule,
    // The two funnel boundaries that decide activation ("link created", "client
    // opened it"). Write-only instrumentation; it gates nothing.
    AnalyticsModule,
  ],
  controllers: [ShareController, SharePublicController],
  providers: [
    ShareService,
    { provide: SHARE_LINK_REPOSITORY, useClass: PrismaShareLinkRepository },
  ],
  // The repository token is exported so the projects read-model can answer "was
  // this sent to the client?" without a second HTTP round trip per card.
  exports: [ShareService, SHARE_LINK_REPOSITORY],
})
export class ShareModule {}
