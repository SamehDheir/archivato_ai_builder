import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import {
  PIPELINE_STAGES,
  type JobState,
  type JobStatus,
  type PipelineStageName,
} from '@archivato/shared';
import {
  GENERATE_JOB,
  PIPELINE_QUEUE,
  type GenerateJobData,
} from './pipeline.constants';

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(PIPELINE_QUEUE) private readonly queue: Queue<GenerateJobData>,
  ) {}

  /** Enqueue a generation job for one stage and return its initial status. */
  async enqueue(sessionId: string, stage: string): Promise<JobStatus> {
    if (!PIPELINE_STAGES.includes(stage as PipelineStageName)) {
      throw new BadRequestException(`Unknown pipeline stage "${stage}".`);
    }
    const job = await this.queue.add(
      GENERATE_JOB,
      { sessionId, stage: stage as PipelineStageName },
      {
        // Keep finished jobs around briefly so the client can poll the result.
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 3600, count: 1000 },
        attempts: 1,
      },
    );
    return this.toStatus(job);
  }

  /**
   * Fetch a job's status. The session id from the (owner-guarded) route must
   * match the job's payload, so a user can't read another session's job by
   * pairing their own session id with a foreign job id.
   */
  async status(sessionId: string, jobId: string): Promise<JobStatus> {
    const job = await this.queue.getJob(jobId);
    if (!job || job.data.sessionId !== sessionId) {
      throw new NotFoundException(`Job ${jobId} not found.`);
    }
    return this.toStatus(job);
  }

  private async toStatus(job: Job<GenerateJobData>): Promise<JobStatus> {
    const state = normalizeState(await job.getState());
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    return {
      id: String(job.id),
      sessionId: job.data.sessionId,
      stage: job.data.stage,
      state,
      progress,
      result: state === 'completed' ? job.returnvalue : undefined,
      error: state === 'failed' ? job.failedReason : undefined,
    };
  }
}

/** Map BullMQ's job-state string onto our normalized union. */
function normalizeState(state: string): JobState {
  switch (state) {
    case 'waiting':
    case 'waiting-children':
    case 'prioritized':
      return 'waiting';
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'delayed':
      return 'delayed';
    default:
      return 'unknown';
  }
}
