import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ProposalDraft } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { THROTTLE_AI } from '../common/throttling';
import { ProposalService } from './proposal.service';
import { GenerateProposalDto } from './dto/generate-proposal.dto';

/**
 * The proposal cover message (R13). Owner-only in full — a client must never learn
 * how their vendor pitched them, what price was floated, or which drafts were
 * discarded, so none of this has a public counterpart.
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('proposal')
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  /**
   * Write a message and add it to the project's history. Pro-gated like every
   * stage past the API design, and throttled as a paid-LLM route.
   */
  @UseGuards(ProGuard)
  @Throttle(THROTTLE_AI)
  @Post(':sessionId/generate')
  generate(
    @Param('sessionId') sessionId: string,
    @Body() dto: GenerateProposalDto,
  ): Promise<ProposalDraft> {
    return this.proposals.generate(sessionId, dto);
  }

  /** The project's last few drafts, newest first. */
  @Get(':sessionId/drafts')
  history(@Param('sessionId') sessionId: string): Promise<ProposalDraft[]> {
    return this.proposals.history(sessionId);
  }
}
