import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { CostEstimate } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { CostEstimateService } from './cost-estimate.service';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('cost-estimate')
export class CostEstimateController {
  constructor(private readonly costs: CostEstimateService) {}

  /** Generate (or regenerate) the cost estimate for a session. Pro-gated. */
  @UseGuards(ProGuard)
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<CostEstimate> {
    return this.costs.generate(sessionId);
  }

  /** Fetch a previously generated cost estimate. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<CostEstimate> {
    return this.costs.get(sessionId);
  }
}
