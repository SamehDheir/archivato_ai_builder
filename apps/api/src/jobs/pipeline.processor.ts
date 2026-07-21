import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  DEFAULT_ARTIFACT_LANGUAGE,
  normalizeUsageStage,
  type PipelineStageName,
} from '@archivato/shared';
import {
  lazyArtifactLanguage,
  runWithLlmContext,
} from '../llm/usage/llm-usage.context';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { resolveArtifactLanguage } from '../interview/interview-session.entity';
import { RequirementsService } from '../requirements/requirements.service';
import { SystemDesignService } from '../system-design/system-design.service';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { ApiDesignService } from '../api-design/api-design.service';
import { ReviewService } from '../review/review.service';
import { VersionsService } from '../versions/versions.service';
import { PIPELINE_QUEUE, type GenerateJobData } from './pipeline.constants';

/**
 * Background worker that runs a single pipeline stage's `generate()` off the
 * request thread. Each stage service already enforces its own upstream gate, so
 * a missing prerequisite simply fails the job (surfaced as `failedReason`).
 */
@Processor(PIPELINE_QUEUE)
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(
    private readonly requirements: RequirementsService,
    private readonly systemDesign: SystemDesignService,
    private readonly databaseDesign: DatabaseDesignService,
    private readonly apiDesign: ApiDesignService,
    private readonly review: ReviewService,
    private readonly versions: VersionsService,
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
  ) {
    super();
  }

  async process(job: Job<GenerateJobData>): Promise<unknown> {
    const { sessionId, stage, userId } = job.data;
    this.logger.log(`Generating ${stage} for session ${sessionId} (job ${job.id})`);
    await job.updateProgress(10);
    // The worker has no HTTP request, so the global interceptor can't attribute
    // its LLM usage — establish the same context from the job payload instead.
    const result = await runWithLlmContext(
      {
        userId: userId ?? null,
        sessionId,
        stage: normalizeUsageStage(stage),
        // …and the artifact language with it, so a stage generated through the
        // queue is written in the same language as one generated through the SSE
        // stream. Without this, which language a document came out in would
        // depend on which transport the client happened to use.
        resolveLanguage: lazyArtifactLanguage(async () => {
          const session = await this.sessions.findById(sessionId);
          return session
            ? resolveArtifactLanguage(session)
            : DEFAULT_ARTIFACT_LANGUAGE;
        }),
      },
      () => this.run(stage, sessionId),
    );
    // Record a new project version capturing this modification.
    await this.versions.snapshot(sessionId, `generate ${stage}`);
    await job.updateProgress(100);
    return result;
  }

  private run(stage: PipelineStageName, sessionId: string): Promise<unknown> {
    switch (stage) {
      case 'requirements':
        return this.requirements.generate(sessionId);
      case 'system-design':
        return this.systemDesign.generate(sessionId);
      case 'database-design':
        return this.databaseDesign.generate(sessionId);
      case 'api-design':
        return this.apiDesign.generate(sessionId);
      case 'review':
        return this.review.generate(sessionId);
      default:
        // Exhaustiveness guard — unreachable if PipelineStageName is covered.
        throw new Error(`Unknown pipeline stage: ${stage as string}`);
    }
  }
}
