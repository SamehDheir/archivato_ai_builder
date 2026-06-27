import { Module } from '@nestjs/common';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { INTERVIEW_SESSION_REPOSITORY } from './interview-session.repository';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    ProductAnalystAgent,
    {
      // Swap this class for a Prisma-backed repo in the persistence slice.
      provide: INTERVIEW_SESSION_REPOSITORY,
      useClass: InMemoryInterviewSessionRepository,
    },
  ],
  // Export the session store so RequirementsModule reads the same instance.
  exports: [INTERVIEW_SESSION_REPOSITORY],
})
export class InterviewModule {}
