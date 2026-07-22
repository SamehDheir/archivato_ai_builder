import {
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { BusinessAnalysis } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { THROTTLE_AI } from '../common/throttling';
import { BusinessAnalysisService } from './business-analysis.service';

/**
 * Owner-guarded, free tier (no `ProGuard`) — it feeds the free Requirements
 * stage, so paywalling it would paywall the free pipeline by the back door.
 * Throttled as a paid-LLM route like every other generate.
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('business-analysis')
export class BusinessAnalysisController {
  constructor(private readonly analysis: BusinessAnalysisService) {}

  /**
   * Generate (or regenerate) the business analysis for a session.
   *
   * A plain re-run REUSES the researched facts (competitors, market read) from
   * the last run when the interview is unchanged — only the framing is rewritten,
   * so the client-facing facts don't churn. `?refreshFacts=true` forces a full
   * re-research (and re-pins the facts), the one explicit way to change them.
   */
  @Throttle(THROTTLE_AI)
  @Post(':sessionId/generate')
  generate(
    @Param('sessionId') sessionId: string,
    @Query('refreshFacts', new ParseBoolPipe({ optional: true }))
    refreshFacts?: boolean,
  ): Promise<BusinessAnalysis> {
    return this.analysis.generate(sessionId, { refreshFacts: refreshFacts ?? false });
  }

  /** Fetch a previously generated business analysis. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<BusinessAnalysis> {
    return this.analysis.get(sessionId);
  }
}
