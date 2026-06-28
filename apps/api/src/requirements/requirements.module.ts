import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { REQUIREMENT_DOCUMENT_REPOSITORY } from './requirement-document.repository';
import { PrismaRequirementDocumentRepository } from './prisma-requirement-document.repository';

@Module({
  // InterviewModule exports the shared session repository so requirements can
  // read confirmed sessions from the same store.
  imports: [InterviewModule],
  controllers: [RequirementsController],
  providers: [
    RequirementsService,
    RequirementEngineerAgent,
    {
      provide: REQUIREMENT_DOCUMENT_REPOSITORY,
      useClass: PrismaRequirementDocumentRepository,
    },
  ],
  // Export the doc store so downstream stages (System Design) read the same data.
  exports: [REQUIREMENT_DOCUMENT_REPOSITORY],
})
export class RequirementsModule {}
