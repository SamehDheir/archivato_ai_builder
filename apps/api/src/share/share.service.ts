import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ApiDesign,
  CostEstimate,
  DatabaseDesign,
  ProductVision,
  ProjectRoadmap,
  QaPlan,
  RequirementDocument,
  ReviewReport,
  ShareLink,
  SharedProject,
  SystemDesign,
  ThreatModel,
} from '@archivato/shared';
import { redactReviewForShare, shouldWatermarkShare } from '@archivato/shared';
import { BillingService } from '../billing/billing.service';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from '../requirements/requirement-document.repository';
import {
  SYSTEM_DESIGN_REPOSITORY,
  type SystemDesignRepository,
} from '../system-design/system-design.repository';
import {
  DATABASE_DESIGN_REPOSITORY,
  type DatabaseDesignRepository,
} from '../database-design/database-design.repository';
import {
  API_DESIGN_REPOSITORY,
  type ApiDesignRepository,
} from '../api-design/api-design.repository';
import {
  REVIEW_REPORT_REPOSITORY,
  type ReviewReportRepository,
} from '../review/review-report.repository';
import {
  PRODUCT_VISION_REPOSITORY,
  type ProductVisionRepository,
} from '../product-vision/product-vision.repository';
import {
  COST_ESTIMATE_REPOSITORY,
  type CostEstimateRepository,
} from '../cost-estimate/cost-estimate.repository';
import {
  PROJECT_ROADMAP_REPOSITORY,
  type ProjectRoadmapRepository,
} from '../roadmap/roadmap.repository';
import {
  THREAT_MODEL_REPOSITORY,
  type ThreatModelRepository,
} from '../threat-model/threat-model.repository';
import {
  QA_PLAN_REPOSITORY,
  type QaPlanRepository,
} from '../qa-plan/qa-plan.repository';
import {
  SHARE_LINK_REPOSITORY,
  type ShareLinkRepository,
} from './share-link.repository';

/** 32 bytes of CSPRNG entropy — the token is the only credential on the link. */
const TOKEN_BYTES = 32;

/** The artifacts a session has produced, gated to the shareable floor. */
interface ShareableDesign {
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  /**
   * Optional artifacts. `vision` is a free stage (so it's usually there); the
   * rest are Pro. None of them gate the link — a design is shareable without
   * them, and the page omits the section rather than rendering an empty one.
   */
  vision: ProductVision | null;
  costEstimate: CostEstimate | null;
  roadmap: ProjectRoadmap | null;
  apiDesign: ApiDesign | null;
  review: ReviewReport | null;
  threatModel: ThreatModel | null;
  qaPlan: QaPlan | null;
}

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly links: ShareLinkRepository,
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirements: RequirementDocumentRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly systemDesigns: SystemDesignRepository,
    @Inject(DATABASE_DESIGN_REPOSITORY)
    private readonly databaseDesigns: DatabaseDesignRepository,
    @Inject(API_DESIGN_REPOSITORY)
    private readonly apiDesigns: ApiDesignRepository,
    @Inject(REVIEW_REPORT_REPOSITORY)
    private readonly reviews: ReviewReportRepository,
    @Inject(PRODUCT_VISION_REPOSITORY)
    private readonly visions: ProductVisionRepository,
    @Inject(COST_ESTIMATE_REPOSITORY)
    private readonly estimates: CostEstimateRepository,
    @Inject(PROJECT_ROADMAP_REPOSITORY)
    private readonly roadmaps: ProjectRoadmapRepository,
    @Inject(THREAT_MODEL_REPOSITORY)
    private readonly threatModels: ThreatModelRepository,
    @Inject(QA_PLAN_REPOSITORY)
    private readonly qaPlans: QaPlanRepository,
    // Read-only, and NOT a gate: billing is consulted purely to decide whether
    // the page carries our watermark. Sharing itself must never depend on a plan
    // (see the controller) — the day this import becomes a `ProGuard` again is
    // the day the growth loop dies.
    private readonly billing: BillingService,
  ) {}

  /** The owner's current link for a session, or null when nothing is shared. */
  async get(sessionId: string): Promise<ShareLink | null> {
    const link = await this.links.findBySessionId(sessionId);
    return link ? toShareLink(link) : null;
  }

  /**
   * Mint a public link. Idempotent: an existing link is returned as-is, so
   * "Share" never silently invalidates a link the owner has already sent out
   * (rotating is `revoke` + `create`).
   *
   * **Free on every plan.** This used to reuse `ExportService.bundle()` for its
   * gate, which inherited export's "complete through the API design" rule — and
   * the API design is Pro-only, so pairing that gate with a free route would have
   * produced a button that always 409s. Sharing therefore gates on its own floor
   * (`readDesign`) and is *not* a subset of export any more.
   */
  async create(sessionId: string): Promise<ShareLink> {
    await this.readDesign(sessionId);

    // `createIfAbsent` is what actually guarantees idempotency (a double-submit
    // would otherwise collide on the sessionId PK); this read just avoids burning
    // a token on the common "already shared" path.
    const existing = await this.links.findBySessionId(sessionId);
    if (existing) return toShareLink(existing);

    const created = await this.links.createIfAbsent({
      sessionId,
      token: randomBytes(TOKEN_BYTES).toString('base64url'),
      viewCount: 0,
      lastViewedAt: null,
      createdAt: new Date(),
    });
    return toShareLink(created);
  }

  /** Revoke the link. The row is deleted, so the token dies permanently. */
  async revoke(sessionId: string): Promise<void> {
    await this.links.deleteBySessionId(sessionId);
  }

  /**
   * Resolve a public token to the read-only project. **This is the only path an
   * unauthenticated caller has into a session**, so it returns strictly the
   * `SharedProject` contract — no session id, no owner, no interview transcript.
   */
  async view(token: string): Promise<SharedProject> {
    const link = await this.links.findByToken(token);
    if (!link) throw new NotFoundException('This share link is not available.');

    // Independent reads, so don't pay for them serially — this is the one route
    // built to absorb a link going viral.
    const [session, design] = await Promise.all([
      this.sessions.findById(link.sessionId),
      // The design can regress out from under a live link (e.g. a version restore
      // rewinds past the database design). A link holder gets "gone", not the 409
      // the owner would see — they can't act on it and shouldn't learn why.
      this.readDesign(link.sessionId).catch((e: unknown) => {
        if (e instanceof ConflictException || e instanceof NotFoundException) {
          return null;
        }
        throw e;
      }),
    ]);

    if (!session || !design) {
      throw new NotFoundException('This share link is not available.');
    }

    // The watermark is the OWNER's plan, resolved here — a link holder is
    // typically anonymous, and even a signed-in one is the wrong subject: whose
    // proposal this is decides whose brand is on it. Never a client-supplied flag.
    const plan = await this.billing.planFor(session.userId);

    // Best-effort: a failed counter must never break the page.
    this.links.recordView(token).catch((e: unknown) => {
      this.logger.warn(`Failed to record a share view: ${String(e)}`);
    });

    // Every artifact is stamped with the internal session id — the same id that
    // addresses the owner-scoped routes. It grants a stranger nothing (those
    // routes 404 a non-owner), but a public page has no business handing out an
    // internal identifier, so the token stands in for it.
    return {
      token,
      title: session.title ?? session.input.idea,
      sharedAt: link.createdAt.toISOString(),
      idea: session.input,
      vision: design.vision ? { ...design.vision, sessionId: token } : null,
      requirements: { ...design.requirements, sessionId: token },
      costEstimate: design.costEstimate
        ? // `budgetWarning` is OWNER-ONLY (a deal risk, not for the client's
          // eyes): strip it server-side so it can never reach the public page.
          { ...design.costEstimate, sessionId: token, budgetWarning: null }
        : null,
      roadmap: design.roadmap ? { ...design.roadmap, sessionId: token } : null,
      systemDesign: { ...design.systemDesign, sessionId: token },
      databaseDesign: { ...design.databaseDesign, sessionId: token },
      apiDesign: design.apiDesign
        ? { ...design.apiDesign, sessionId: token }
        : null,
      review: design.review
        ? // Strip the OWNER-ONLY client-readiness / consistency (deal-risk)
          // findings server-side — same enforcement as the budget warning above.
          { ...redactReviewForShare(design.review), sessionId: token }
        : null,
      threatModel: design.threatModel
        ? { ...design.threatModel, sessionId: token }
        : null,
      qaPlan: design.qaPlan ? { ...design.qaPlan, sessionId: token } : null,
      watermark: shouldWatermarkShare(plan),
    };
  }

  /**
   * The shareable artifacts, or a 409/404 explaining why there aren't any.
   *
   * The floor is the **database design** — precisely what the Free plan can
   * generate. Below it there is no system to show; above it, the API design and
   * the review are Pro stages that a free owner simply won't have, so they are
   * optional rather than required.
   */
  private async readDesign(sessionId: string): Promise<ShareableDesign> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }

    const [
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
      review,
      vision,
      costEstimate,
      roadmap,
      threatModel,
      qaPlan,
    ] = await Promise.all([
      this.requirements.findBySessionId(sessionId),
      this.systemDesigns.findBySessionId(sessionId),
      this.databaseDesigns.findBySessionId(sessionId),
      this.apiDesigns.findBySessionId(sessionId),
      this.reviews.findBySessionId(sessionId),
      this.visions.findBySessionId(sessionId),
      this.estimates.findBySessionId(sessionId),
      this.roadmaps.findBySessionId(sessionId),
      this.threatModels.findBySessionId(sessionId),
      this.qaPlans.findBySessionId(sessionId),
    ]);

    // The gate is unchanged: the design chain through the database design. The
    // client-facing artifacts are additive — never required — so adding them
    // cannot make a previously shareable design un-shareable.
    if (!requirements || !systemDesign || !databaseDesign) {
      throw new ConflictException(
        'Generate the design through the database design before sharing.',
      );
    }

    return {
      requirements,
      systemDesign,
      databaseDesign,
      vision: vision ?? null,
      costEstimate: costEstimate ?? null,
      roadmap: roadmap ?? null,
      apiDesign: apiDesign ?? null,
      review: review ?? null,
      threatModel: threatModel ?? null,
      qaPlan: qaPlan ?? null,
    };
  }
}

function toShareLink(link: {
  token: string;
  createdAt: Date;
  viewCount: number;
}): ShareLink {
  return {
    token: link.token,
    createdAt: link.createdAt.toISOString(),
    viewCount: link.viewCount,
  };
}
