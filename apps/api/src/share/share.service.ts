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
import {
  redactReviewForShare,
  withoutGeneration,
  resolveExtendedArtifacts,
  shouldWatermarkShare,
} from '@archivato/shared';
import { BillingService } from '../billing/billing.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { resolveArtifactLanguage } from '../interview/interview-session.entity';
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
    // Read-only instrumentation: the two share boundaries are where the activation
    // funnel is actually decided, so they are recorded at the service (the mint
    // path is the only place that can tell a first share from a repeat click).
    private readonly analytics: AnalyticsService,
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

    // The funnel's decisive step, recorded on the **mint** path only. Minting is
    // idempotent and the web calls it on every "Copy client link" click, so
    // recording unconditionally would count clicks instead of deals. The session
    // read is the price of attribution — it happens once per project, ever.
    void this.recordShareEvent('share_created', sessionId);

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
    // `confirm()` pins this, and a shareable design implies a confirmed interview,
    // so in practice the stored value is always explicit here — resolve anyway
    // rather than assume, since the fallback is a pure function of the slots.
    const extended = resolveExtendedArtifacts(
      session.generateExtendedArtifacts,
      session.slots,
    );

    // Best-effort: a failed counter must never break the page.
    this.links.recordView(token).catch((e: unknown) => {
      this.logger.warn(`Failed to record a share view: ${String(e)}`);
    });

    // The funnel step is "the client opened it", so only the FIRST view is
    // recorded. That is the fact worth measuring, and it is also what keeps this
    // route safe to leave `@SkipThrottle()`: a link going viral must not write an
    // analytics row per reader. Every subsequent view still lands on the counter
    // and `lastViewedAt`, which is where the owner reads it.
    //
    // Note what is deliberately NOT captured: no country, no visitor id, nothing
    // about the reader. The page is server-rendered, so this request arrives from
    // our own Next.js server — a country resolved here would be our hosting
    // region wearing the reader's name, which is worse than no answer.
    if (link.viewCount === 0) {
      void this.recordShareEvent('share_viewed', link.sessionId, session.userId);
    }

    // Every artifact is stamped with the internal session id — the same id that
    // addresses the owner-scoped routes. It grants a stranger nothing (those
    // routes 404 a non-owner), but a public page has no business handing out an
    // internal identifier, so the token stands in for it.
    return {
      token,
      title: session.title ?? session.input.idea,
      sharedAt: link.createdAt.toISOString(),
      idea: session.input,
      vision: design.vision
        ? withoutGeneration({ ...design.vision, sessionId: token })
        : null,
      requirements: withoutGeneration({ ...design.requirements, sessionId: token }),
      costEstimate: design.costEstimate
        ? // `budgetWarning` is OWNER-ONLY (a deal risk, not for the client's
          // eyes): strip it server-side so it can never reach the public page.
          { ...design.costEstimate, sessionId: token, budgetWarning: null }
        : null,
      roadmap: design.roadmap
        ? withoutGeneration({ ...design.roadmap, sessionId: token })
        : null,
      systemDesign: withoutGeneration({
        ...design.systemDesign,
        sessionId: token,
        // OWNER-ONLY: "these requirements have no owning service" is an internal
        // quality signal for the person still editing the design. Showing a client
        // that their own scoping has gaps — in the document being used to win the
        // work — is the opposite of what it is for.
        uncoveredRequirements: undefined,
      }),
      databaseDesign: withoutGeneration({ ...design.databaseDesign, sessionId: token }),
      apiDesign: design.apiDesign
        ? withoutGeneration({ ...design.apiDesign, sessionId: token })
        : null,
      review: design.review
        ? // Strip the OWNER-ONLY client-readiness / consistency (deal-risk)
          // findings server-side — same enforcement as the budget warning above.
          withoutGeneration({ ...redactReviewForShare(design.review), sessionId: token })
        : null,
      // R12 — a project with the extended artifacts switched off shows neither,
      // even if it generated them before the owner turned them off. Enforced here
      // rather than by not-generating alone: the payload is the boundary, and the
      // owner's decision that these aren't part of *this* deal has to hold for an
      // artifact that already exists.
      threatModel:
        extended && design.threatModel
          ? withoutGeneration({ ...design.threatModel, sessionId: token })
          : null,
      qaPlan:
        extended && design.qaPlan
          ? withoutGeneration({ ...design.qaPlan, sessionId: token })
          : null,
      watermark: shouldWatermarkShare(plan),
      // Read off the session, not off one artifact: the requirement document is
      // the oldest artifact in the package, so an owner who switched language and
      // regenerated only the later stages would otherwise have the page laid out
      // for a document that no longer represents it. The session is the one place
      // that holds the project's current answer.
      language: resolveArtifactLanguage(session),
    };
  }

  /**
   * Record a funnel boundary against the link's **owner**, never its reader.
   *
   * A share view is the one funnel step whose actor is a stranger, and the
   * stranger is not the subject: the question the funnel answers is "did this
   * owner's scoping reach a client", so the row belongs to the owner. Nothing
   * identifying the reader is recorded — `visitorId` stays null on purpose, so
   * the anonymous browsing cookie is never joined to somebody's project.
   *
   * Best-effort throughout: this is instrumentation hanging off a page that has
   * already been served.
   */
  private async recordShareEvent(
    type: 'share_created' | 'share_viewed',
    sessionId: string,
    knownOwnerId?: string | null,
  ): Promise<void> {
    try {
      const userId =
        knownOwnerId !== undefined
          ? knownOwnerId
          : ((await this.sessions.findById(sessionId))?.userId ?? null);
      if (!userId) return; // an owner-less session has no funnel to belong to
      await this.analytics.recordSafe({ type, userId, meta: { sessionId } });
    } catch (e: unknown) {
      this.logger.warn(`Failed to record ${type}: ${String(e)}`);
    }
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
    // R12 — resolved here as well as in `view()`; both are cheap pure calls, and
    // this one is what keeps the two extra reads off the hot path.
    const extended = resolveExtendedArtifacts(
      session.generateExtendedArtifacts,
      session.slots,
    );

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
      // R12 — a project that switched these off will have them nulled from the
      // payload anyway, so don't pay for the reads. This is the one route built to
      // absorb a link going viral.
      extended ? this.threatModels.findBySessionId(sessionId) : null,
      extended ? this.qaPlans.findBySessionId(sessionId) : null,
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
  lastViewedAt: Date | null;
}): ShareLink {
  return {
    token: link.token,
    createdAt: link.createdAt.toISOString(),
    viewCount: link.viewCount,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
  };
}
