import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ThreatModel } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { THROTTLE_AI } from '../common/throttling';
import { ThreatModelService } from './threat-model.service';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('threat-model')
export class ThreatModelController {
  constructor(private readonly threatModel: ThreatModelService) {}

  /** Generate (or regenerate) the STRIDE threat model. Pro-gated + throttled (LLM). */
  @UseGuards(ProGuard)
  @Throttle(THROTTLE_AI)
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<ThreatModel> {
    return this.threatModel.generate(sessionId);
  }

  /** Fetch a previously generated threat model. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ThreatModel> {
    return this.threatModel.get(sessionId);
  }
}
