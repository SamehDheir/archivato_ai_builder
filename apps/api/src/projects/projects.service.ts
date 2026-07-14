import { Inject, Injectable } from '@nestjs/common';
import type { ProjectArtifacts, ProjectOverview } from '@archivato/shared';
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
  SHARE_LINK_REPOSITORY,
  type ShareLinkRepository,
} from '../share/share-link.repository';

/**
 * The dashboard's read model: every scoping the user owns, plus the two facts the
 * card needs and the interview session cannot answer — **how far the pipeline
 * got** and **whether the client has been sent a link**.
 *
 * It lives in its own module rather than on `InterviewService` because the design
 * modules all import `InterviewModule` (for the session repo + owner guard), so
 * the interview cannot import them back without a cycle. Composing downward from
 * a read-only module is the cycle-free direction — and it keeps the write path
 * (the interview state machine) free of reporting concerns.
 *
 * Progress is derived from **artifact existence**, never a stored stage counter:
 * the artifacts are the truth (each stage 409s until its upstream exists, and a
 * version restore can rewind the design), so a counter would drift.
 */
@Injectable()
export class ProjectsService {
  constructor(
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
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly links: ShareLinkRepository,
  ) {}

  /** The user's scopings, most recently updated first (the repo's order). */
  async list(userId: string): Promise<ProjectOverview[]> {
    const sessions = await this.sessions.findByUserId(userId);

    // A plan caps a user at 1–5 projects, so this fans out over a handful of
    // sessions, not a table scan. If the cap ever rises far enough for this to
    // matter, the fix is a batched `existsBySessionIds` behind these repository
    // interfaces — not a stage column on the session.
    return Promise.all(
      sessions.map(async (session) => {
        const [artifacts, link] = await Promise.all([
          this.artifactsFor(session.id),
          this.links.findBySessionId(session.id),
        ]);
        return {
          sessionId: session.id,
          idea: session.input.idea,
          title: session.title ?? undefined,
          clientName: session.clientName ?? undefined,
          status: session.status,
          completeness: Math.round(session.coverage * 100) / 100,
          updatedAt: session.updatedAt.toISOString(),
          artifacts,
          // Only *whether* a link exists. The token is a bearer credential — the
          // owner can fetch it from `/share/:id` on demand (minting is idempotent),
          // so there is no reason to ship every one of them on every list load.
          shared: !!link,
        };
      }),
    );
  }

  /** Which artifacts this session has produced. */
  private async artifactsFor(sessionId: string): Promise<ProjectArtifacts> {
    const [requirements, systemDesign, databaseDesign, apiDesign, review] =
      await Promise.all([
        this.requirements.findBySessionId(sessionId),
        this.systemDesigns.findBySessionId(sessionId),
        this.databaseDesigns.findBySessionId(sessionId),
        this.apiDesigns.findBySessionId(sessionId),
        this.reviews.findBySessionId(sessionId),
      ]);

    return {
      requirements: !!requirements,
      systemDesign: !!systemDesign,
      databaseDesign: !!databaseDesign,
      apiDesign: !!apiDesign,
      review: !!review,
    };
  }
}
