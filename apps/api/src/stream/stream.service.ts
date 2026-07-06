import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  buildNarration,
  type PipelineStageName,
  type StreamEvent,
} from '@archivato/shared';
import { RequirementsService } from '../requirements/requirements.service';
import { SystemDesignService } from '../system-design/system-design.service';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { ApiDesignService } from '../api-design/api-design.service';
import { ReviewService } from '../review/review.service';
import { VersionsService } from '../versions/versions.service';
import { BillingService } from '../billing/billing.service';

/**
 * Stages that require an active Pro plan — mirrors `JobsController.PRO_STAGES`.
 * The gate is enforced here (server-side) BEFORE any generation runs, so a
 * client that opens the stream directly can never generate a Pro artifact.
 */
const PRO_STAGES = new Set<PipelineStageName>(['api-design', 'review']);

/** Human title for the "consulting the …" working step per stage. */
const AGENT_TITLES: Record<PipelineStageName, string> = {
  requirements: 'Requirement Engineer',
  'system-design': 'System Architect',
  'database-design': 'Database Designer',
  'api-design': 'API Designer',
  review: 'AI Architect Reviewer',
};

/** Keep-alive interval while the (possibly slow) model call is in flight. */
const HEARTBEAT_MS = 8_000;
/** Delay between typed chunks of a step's body — a gentle reveal, not real motion. */
const REVEAL_MS = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the "narration" stream for one pipeline stage. It runs the exact same
 * `generate()` the async worker runs (real LLM or deterministic fallback — it
 * persists the artifact and snapshots a version), then yields a human-readable
 * narration of the result, typed out chunk-by-chunk. Because the narration is
 * derived from the finished artifact by the pure `buildNarration()`, it reads
 * identically in mock mode and with a real provider.
 *
 * Yields a `StreamEvent` sequence; the controller adapts it to SSE.
 */
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    private readonly requirements: RequirementsService,
    private readonly systemDesign: SystemDesignService,
    private readonly databaseDesign: DatabaseDesignService,
    private readonly apiDesign: ApiDesignService,
    private readonly review: ReviewService,
    private readonly versions: VersionsService,
    private readonly billing: BillingService,
  ) {}

  async *run(
    sessionId: string,
    stage: PipelineStageName,
    userId: string,
  ): AsyncGenerator<StreamEvent> {
    // 1. Entitlement gate — before any generation, so it can't be bypassed.
    if (PRO_STAGES.has(stage)) {
      try {
        await this.billing.assertPro(userId);
      } catch {
        yield {
          type: 'error',
          message: 'This stage requires a Pro plan.',
          code: 'upgrade_required',
        };
        return;
      }
    }

    // 2. "Working" step: the model call happens here; heartbeats keep the SSE
    //    connection alive through a long generation.
    yield {
      type: 'step',
      id: 'work',
      label: `Consulting the ${AGENT_TITLES[stage]}…`,
    };

    let artifact: unknown;
    try {
      const work = this.generateStage(stage, sessionId);
      let settled = false;
      void work.then(
        () => (settled = true),
        () => (settled = true),
      );
      while (!settled) {
        const tick = await Promise.race([
          work.then(
            () => 'done' as const,
            () => 'done' as const,
          ),
          sleep(HEARTBEAT_MS).then(() => 'tick' as const),
        ]);
        if (tick === 'tick' && !settled) yield { type: 'ping' };
      }
      artifact = await work; // rethrows the real failure (gate/404/etc.)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Generation failed.';
      const code = err instanceof ForbiddenException ? 'forbidden' : undefined;
      yield { type: 'error', message, code };
      return;
    }

    // 3. Version snapshot — same bookkeeping the async worker does.
    try {
      await this.versions.snapshot(sessionId, `generate ${stage}`);
    } catch (err) {
      // A snapshot failure must not sink a successful generation.
      this.logger.warn(
        `Version snapshot failed for ${sessionId}/${stage}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // 4. Narrate the finished artifact, typed out chunk-by-chunk.
    for (const step of buildNarration(stage, artifact)) {
      yield { type: 'step', id: step.id, label: step.label };
      if (step.body) {
        for (const chunk of chunkText(step.body)) {
          yield { type: 'token', stepId: step.id, text: chunk };
          await sleep(REVEAL_MS);
        }
      }
    }

    // 5. Terminal event with the full artifact so the client can render it.
    yield { type: 'artifact', result: artifact };
  }

  /** Route a stage name to its service's `generate()` (mirrors the worker). */
  private generateStage(
    stage: PipelineStageName,
    sessionId: string,
  ): Promise<unknown> {
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
        return Promise.reject(
          new Error(`Unknown pipeline stage: ${stage as string}`),
        );
    }
  }
}

/**
 * Split a body into small chunks for the typed reveal. Splits on whitespace but
 * keeps the trailing space/newline so the reassembled text is byte-identical.
 */
function chunkText(body: string): string[] {
  const matches = body.match(/\S+\s*/g);
  return matches ?? [body];
}
