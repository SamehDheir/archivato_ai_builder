import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProductVision } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { ProductManagerAgent } from '../llm/agents/product-manager.agent';
import {
  PRODUCT_VISION_REPOSITORY,
  type ProductVisionRepository,
} from './product-vision.repository';

@Injectable()
export class ProductVisionService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(PRODUCT_VISION_REPOSITORY)
    private readonly visions: ProductVisionRepository,
    private readonly pm: ProductManagerAgent,
  ) {}

  /**
   * Generate (or regenerate) the product vision. Standalone stage: it only
   * requires a confirmed interview (idea + intent + requirements summary) — it
   * does not depend on, nor gate, the design artifacts.
   */
  async generate(sessionId: string): Promise<ProductVision> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'The product vision requires a confirmed interview.',
      );
    }

    const vision = await this.pm.generate(sessionId, {
      idea: session.input.idea,
      industry: session.input.industry,
      scale: session.input.scale,
      intent: session.intent,
      summary: session.summary,
      // The slots are where the client's stated figures live. Without them the
      // Product Manager had no number to quote and invented its own, which is
      // how the vision's latency target came to contradict the requirement
      // document's. This stage still depends on nothing but the session — the
      // figures are derived, not read from another stage's artifact.
      slots: session.slots ?? undefined,
    });

    return this.visions.upsert(vision);
  }

  async get(sessionId: string): Promise<ProductVision> {
    const vision = await this.visions.findBySessionId(sessionId);
    if (!vision) {
      throw new NotFoundException(
        `No product vision for session ${sessionId}. Generate it first.`,
      );
    }
    return vision;
  }
}
