import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { INTERVIEW_SESSION_REPOSITORY } from './interview-session.repository';
import { PrismaInterviewSessionRepository } from './prisma-interview-session.repository';
import { SessionOwnerGuard } from './session-owner.guard';

@Module({
  imports: [BillingModule], // quota enforcement at the confirm gate
  controllers: [InterviewController],
  providers: [
    InterviewService,
    ProductAnalystAgent,
    InterviewerAgent,
    SessionOwnerGuard,
    {
      provide: INTERVIEW_SESSION_REPOSITORY,
      useClass: PrismaInterviewSessionRepository,
    },
  ],
  // Export the session store + ownership guard so every downstream pipeline
  // module (which imports InterviewModule) can read sessions and enforce owners.
  exports: [INTERVIEW_SESSION_REPOSITORY, SessionOwnerGuard],
})
export class InterviewModule {}
