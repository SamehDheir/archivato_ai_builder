import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  buildNarration,
  isStandaloneStage,
  type StreamStageName,
  type StreamEvent,
} from '@archivato/shared';
import { RequirementsService } from '../requirements/requirements.service';
import { SystemDesignService } from '../system-design/system-design.service';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { ApiDesignService } from '../api-design/api-design.service';
import { ReviewService } from '../review/review.service';
import { BusinessAnalysisService } from '../business-analysis/business-analysis.service';
import { ProductVisionService } from '../product-vision/product-vision.service';
import { RoadmapService } from '../roadmap/roadmap.service';
import { ThreatModelService } from '../threat-model/threat-model.service';
import { QaPlanService } from '../qa-plan/qa-plan.service';
import { VersionsService } from '../versions/versions.service';
import { BillingService } from '../billing/billing.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * Stages that require an active Pro plan — mirrors `JobsController.PRO_STAGES`
 * for the design chain, plus each standalone stage's own `ProGuard`.
 *
 * The gate is enforced here (server-side) BEFORE any generation runs, so a
 * client that opens the stream directly can never generate a Pro artifact. It
 * has to be restated rather than inferred: the standalone controllers carry
 * `ProGuard` as a route decorator, and SSE does not go through those routes.
 * Business analysis and product vision are free stages and are deliberately
 * absent.
 */
const PRO_STAGES = new Set<StreamStageName>([
  'api-design',
  'review',
  'roadmap',
  'threat-model',
  'qa-plan',
]);

/** Human title for the "consulting the …" working step per stage. */
const AGENT_TITLES: Record<StreamStageName, string> = {
  requirements: 'Requirement Engineer',
  'system-design': 'System Architect',
  'database-design': 'Database Designer',
  'api-design': 'API Designer',
  review: 'AI Architect Reviewer',
  'business-analysis': 'Business Analyst',
  'product-vision': 'Product Manager',
  roadmap: 'Roadmap Planner',
  'threat-model': 'Security Engineer',
  'qa-plan': 'QA Lead',
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
    private readonly businessAnalysis: BusinessAnalysisService,
    private readonly productVision: ProductVisionService,
    private readonly roadmap: RoadmapService,
    private readonly threatModel: ThreatModelService,
    private readonly qaPlan: QaPlanService,
    private readonly versions: VersionsService,
    private readonly billing: BillingService,
    private readonly analytics: AnalyticsService,
  ) {}

  async *run(
    sessionId: string,
    stage: StreamStageName,
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

    // Record the generate event only once the gate has passed — a gated free
    // user that never generates must not inflate the metric (mirrors JobsController,
    // which records after assertPro).
    void this.analytics.recordSafe({
      type: 'generate',
      userId,
      meta: { stage, transport: 'stream' },
    });

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
      yield { type: 'error', message, code: errorCode(err) };
      return;
    }

    // 3. Version snapshot — same bookkeeping the async worker does, and ONLY for
    //    the design chain. The standalone artifacts are deliberately excluded
    //    from snapshots (a restore rewinds the design, and these hang off it
    //    without gating it), so snapshotting here would cut a version whose
    //    design content is identical to the last one and make the history read
    //    as though the design changed when nothing did.
    if (!isStandaloneStage(stage)) {
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

  /**
   * Route a stage name to its service's `generate()`.
   *
   * Each call is the SAME method the stage's own controller invokes, so every
   * upstream gate it owns still runs — the standalone stages 409 until their
   * inputs exist exactly as they do over HTTP. Streaming is a transport, not a
   * second way in.
   */
  private generateStage(
    stage: StreamStageName,
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
      case 'business-analysis':
        return this.businessAnalysis.generate(sessionId);
      case 'product-vision':
        return this.productVision.generate(sessionId);
      case 'roadmap':
        return this.roadmap.generate(sessionId);
      case 'threat-model':
        return this.threatModel.generate(sessionId);
      case 'qa-plan':
        return this.qaPlan.generate(sessionId);
      default:
        return Promise.reject(
          new Error(`Unknown stage: ${stage as string}`),
        );
    }
  }
}

/**
 * Map a generation failure to a client-actionable code.
 *
 * `upgrade_required` is emitted by the gate above, before generation. This
 * covers what the stage services themselves throw — and the 409 matters now
 * that the standalone stages stream: roadmap, threat model and QA plan all
 * refuse until the API design exists, and without a code the client shows a raw
 * message for a state it could explain ("finish the pipeline first").
 */
function errorCode(err: unknown): string | undefined {
  if (err instanceof ForbiddenException) return 'forbidden';
  if (err instanceof ConflictException) return 'stage_not_ready';
  return undefined;
}

/**
 * Split a body into small chunks for the typed reveal. Splits on whitespace but
 * keeps the trailing space/newline so the reassembled text is byte-identical.
 */
function chunkText(body: string): string[] {
  const matches = body.match(/\S+\s*/g);
  return matches ?? [body];
}
