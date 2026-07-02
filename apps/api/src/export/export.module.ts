import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { BillingModule } from '../billing/billing.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  // Pull in every upstream store to assemble the export bundle.
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    BillingModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
