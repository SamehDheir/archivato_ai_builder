import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  FixLogEntry,
  FixProposal,
  FixResult,
  ReviewReport,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { THROTTLE_AI } from '../common/throttling';
import { ReviewService } from './review.service';
import { ReviewFixService } from './review-fix.service';
import {
  AddClientQuestionDto,
  AddOutOfScopeDto,
  ApplyFixDto,
  ProposeFixDto,
  ResolveAdvisoryDto,
} from './dto/fix.dto';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('review')
export class ReviewController {
  constructor(
    private readonly review: ReviewService,
    private readonly fixes: ReviewFixService,
  ) {}

  /** Generate (or regenerate) the review report for a session. Pro-gated. */
  @UseGuards(ProGuard)
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<ReviewReport> {
    return this.review.generate(sessionId);
  }

  /** Fetch a previously generated review report. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ReviewReport> {
    return this.review.get(sessionId);
  }

  // ── R11: findings → fixes ────────────────────────────────────────────────
  //
  // Every route below acts on the review, itself a Pro artifact, so they all carry
  // `ProGuard`. Only `propose` calls a model, so only it is throttled as an AI
  // route — the rest are ordinary owner-scoped writes.

  /**
   * Draft a fix for the selected finding(s). **Writes nothing** — the owner
   * previews the result and approves it via `apply`.
   */
  @UseGuards(ProGuard)
  @Throttle(THROTTLE_AI)
  @Post(':sessionId/fix/propose')
  propose(
    @Param('sessionId') sessionId: string,
    @Body() dto: ProposeFixDto,
  ): Promise<FixProposal> {
    return this.fixes.propose(sessionId, dto.findingIds);
  }

  /** Apply a proposal the owner explicitly approved. */
  @UseGuards(ProGuard)
  @Post(':sessionId/fix/apply')
  apply(
    @Param('sessionId') sessionId: string,
    @Body() dto: ApplyFixDto,
  ): Promise<FixResult> {
    return this.fixes.applyPatch(sessionId, dto);
  }

  /** Convert a needs-client finding into a question for the client. No LLM call. */
  @UseGuards(ProGuard)
  @Post(':sessionId/fix/client-question')
  addClientQuestion(
    @Param('sessionId') sessionId: string,
    @Body() dto: AddClientQuestionDto,
  ): Promise<FixResult> {
    return this.fixes.addClientQuestion(sessionId, dto.findingId, dto.question);
  }

  /** Convert a needs-client finding into an out-of-scope line. No LLM call. */
  @UseGuards(ProGuard)
  @Post(':sessionId/fix/out-of-scope')
  addOutOfScope(
    @Param('sessionId') sessionId: string,
    @Body() dto: AddOutOfScopeDto,
  ): Promise<FixResult> {
    return this.fixes.addOutOfScope(
      sessionId,
      dto.findingId,
      dto.item,
      dto.reason,
    );
  }

  /** Acknowledge or dismiss an advisory finding. Status + log only. */
  @UseGuards(ProGuard)
  @Post(':sessionId/fix/advisory')
  resolveAdvisory(
    @Param('sessionId') sessionId: string,
    @Body() dto: ResolveAdvisoryDto,
  ): Promise<FixResult> {
    return this.fixes.resolveAdvisory(
      sessionId,
      dto.findingId,
      dto.action,
      dto.note,
    );
  }

  /** The session's append-only fix log. */
  @Get(':sessionId/fix-log')
  fixLog(@Param('sessionId') sessionId: string): Promise<FixLogEntry[]> {
    return this.fixes.fixLog(sessionId);
  }
}
