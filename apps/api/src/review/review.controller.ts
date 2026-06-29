import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { ReviewReport } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ReviewService } from './review.service';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  /** Generate (or regenerate) the review report for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<ReviewReport> {
    return this.review.generate(sessionId);
  }

  /** Fetch a previously generated review report. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ReviewReport> {
    return this.review.get(sessionId);
  }
}
