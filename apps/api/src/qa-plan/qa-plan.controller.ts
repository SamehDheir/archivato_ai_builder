import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { QaPlan } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { THROTTLE_AI } from '../common/throttling';
import { QaPlanService } from './qa-plan.service';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('qa-plan')
export class QaPlanController {
  constructor(private readonly qaPlan: QaPlanService) {}

  /** Generate (or regenerate) the test/QA plan. Pro-gated + throttled (LLM). */
  @UseGuards(ProGuard)
  @Throttle(THROTTLE_AI)
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<QaPlan> {
    return this.qaPlan.generate(sessionId);
  }

  /** Fetch a previously generated QA plan. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<QaPlan> {
    return this.qaPlan.get(sessionId);
  }
}
