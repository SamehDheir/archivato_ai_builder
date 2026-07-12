import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { ExportModule } from '../export/export.module';
import { BillingModule } from '../billing/billing.module';
import { ShareController } from './share.controller';
import { SharePublicController } from './share-public.controller';
import { ShareService } from './share.service';
import { SHARE_LINK_REPOSITORY } from './share-link.repository';
import { PrismaShareLinkRepository } from './prisma-share-link.repository';

@Module({
  imports: [
    // Session store + SessionOwnerGuard.
    InterviewModule,
    // ExportService.bundle() — both the artifacts and the "pipeline complete
    // through the API design" gate.
    ExportModule,
    // ProGuard on link creation.
    BillingModule,
  ],
  controllers: [ShareController, SharePublicController],
  providers: [
    ShareService,
    { provide: SHARE_LINK_REPOSITORY, useClass: PrismaShareLinkRepository },
  ],
  exports: [ShareService],
})
export class ShareModule {}
