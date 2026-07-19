import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { BusinessAnalysisModule } from '../business-analysis/business-analysis.module';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { REQUIREMENT_DOCUMENT_REPOSITORY } from './requirement-document.repository';
import { PrismaRequirementDocumentRepository } from './prisma-requirement-document.repository';

@Module({
  // InterviewModule exports the shared session repository so requirements can
  // read confirmed sessions from the same store. BusinessAnalysisModule is
  // imported for its repository token only — the analysis is read as prompt
  // context, one-way (business-analysis knows nothing about requirements).
  imports: [InterviewModule, BusinessAnalysisModule],
  controllers: [RequirementsController],
  providers: [
    RequirementsService,
    RequirementEngineerAgent,
    {
      provide: REQUIREMENT_DOCUMENT_REPOSITORY,
      useClass: PrismaRequirementDocumentRepository,
    },
  ],
  // Export the doc store (downstream stages) + the service (async job worker).
  exports: [REQUIREMENT_DOCUMENT_REPOSITORY, RequirementsService],
})
export class RequirementsModule {}
