import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { ShareModule } from '../share/share.module';
import { BillingModule } from '../billing/billing.module';
import { ProposalWriterAgent } from '../llm/agents/proposal-writer.agent';
import { ProposalController } from './proposal.controller';
import { ProposalService } from './proposal.service';

/**
 * The proposal cover message (R13).
 *
 * It imports **downward only** — the upstream stores it reads facts from, plus
 * `ShareModule` for the link the message is built around. Nothing imports this
 * module back, so the graph stays acyclic.
 *
 * There is no repository here on purpose: drafts are the owner's outbox, not a
 * generated artifact, so they live in a capped JSON column on the session (the
 * R11 `fixLog` precedent) rather than in a table of their own.
 */
@Module({
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    ApiDesignModule,
    // The roadmap supplies the MVP statement, and is optional — a project without
    // one simply produces a message with no "what ships first" line.
    RoadmapModule,
    // The link the whole message exists to carry. `create` is idempotent, so this
    // is a read in every practical sense.
    ShareModule,
    // For `ProGuard` only.
    BillingModule,
  ],
  controllers: [ProposalController],
  providers: [ProposalService, ProposalWriterAgent],
  exports: [ProposalService],
})
export class ProposalModule {}
