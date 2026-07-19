import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { BusinessAnalystAgent } from '../llm/agents/business-analyst.agent';
import { BusinessAnalysisController } from './business-analysis.controller';
import { BusinessAnalysisService } from './business-analysis.service';
import { BUSINESS_ANALYSIS_REPOSITORY } from './business-analysis.repository';
import { PrismaBusinessAnalysisRepository } from './prisma-business-analysis.repository';

@Module({
  // Only the interview — the analysis reads the confirmed session and nothing
  // downstream. `RequirementsModule` imports the repository token from here to
  // read the analysis as context, which keeps the dependency one-way.
  imports: [InterviewModule],
  controllers: [BusinessAnalysisController],
  providers: [
    BusinessAnalysisService,
    BusinessAnalystAgent,
    {
      provide: BUSINESS_ANALYSIS_REPOSITORY,
      useClass: PrismaBusinessAnalysisRepository,
    },
  ],
  exports: [BUSINESS_ANALYSIS_REPOSITORY, BusinessAnalysisService],
})
export class BusinessAnalysisModule {}
