import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { JobStatus } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { JobsService } from './jobs.service';

/**
 * Async pipeline generation. Jobs are nested under `:sessionId` so the same
 * `SessionOwnerGuard` that protects the synchronous routes also guarantees a
 * user can only enqueue/poll jobs for sessions they own.
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Enqueue generation of one stage; returns the initial job status. */
  @Post(':sessionId/:stage')
  enqueue(
    @Param('sessionId') sessionId: string,
    @Param('stage') stage: string,
  ): Promise<JobStatus> {
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
