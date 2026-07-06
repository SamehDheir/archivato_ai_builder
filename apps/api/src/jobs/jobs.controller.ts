import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser, JobStatus } from '@archivato/shared';
import { THROTTLE_AI } from '../common/throttling';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { BillingService } from '../billing/billing.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JobsService } from './jobs.service';

/**
 * Stages that require an active Pro plan: the API design and the review that
 * follows it. Free covers everything up to and including the database design;
 * the pipeline stops at the API design until the user upgrades.
 */
const PRO_STAGES = new Set(['api-design', 'review']);

/**
 * Async pipeline generation. Jobs are nested under `:sessionId` so the same
 * `SessionOwnerGuard` that protects the synchronous routes also guarantees a
 * user can only enqueue/poll jobs for sessions they own.
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly billing: BillingService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Enqueue generation of one stage; returns the initial job status. */
  @Post(':sessionId/:stage')
  @Throttle(THROTTLE_AI)
  async enqueue(
    @Param('sessionId') sessionId: string,
    @Param('stage') stage: string,
    @CurrentUser() user: AuthUser,
  ): Promise<JobStatus> {
    if (PRO_STAGES.has(stage)) await this.billing.assertPro(user.id);
    void this.analytics.recordSafe({
      type: 'generate',
      userId: user.id,
      meta: { stage },
    });
    return this.jobs.enqueue(sessionId, stage);
  }

  /** Poll a job's status (and result once completed). */
  @Get(':sessionId/:jobId')
  status(
    @Param('sessionId') sessionId: string,
    @Param('jobId') jobId: string,
  ): Promise<JobStatus> {
    return this.jobs.status(sessionId, jobId);
  }
}
