import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { DecisionExplanation, SystemDesign } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { THROTTLE_AI } from '../common/throttling';
import { SystemDesignService } from './system-design.service';
import { UpdateSystemDesignDto } from './dto/update-system-design.dto';
import { ExplainDecisionDto } from './dto/explain-decision.dto';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('system-design')
export class SystemDesignController {
  constructor(private readonly systemDesign: SystemDesignService) {}

  /** Generate (or regenerate) the system design for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<SystemDesign> {
    return this.systemDesign.generate(sessionId);
  }

  /**
   * Explain one decision in the design (rationale / tradeoffs / alternatives /
   * risks). Ephemeral — nothing is persisted. Throttled as an LLM-backed route.
   */
  @Throttle(THROTTLE_AI)
  @Post(':sessionId/explain')
  explain(
    @Param('sessionId') sessionId: string,
    @Body() body: ExplainDecisionDto,
  ): Promise<DecisionExplanation> {
    return this.systemDesign.explainDecision(sessionId, body);
  }

  /** Fetch a previously generated system design. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<SystemDesign> {
    return this.systemDesign.get(sessionId);
  }

  /** Save user edits to the system design. */
  @Put(':sessionId')
  update(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateSystemDesignDto,
  ): Promise<SystemDesign> {
    return this.systemDesign.save(sessionId, body);
  }
}
