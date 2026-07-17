import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildConsistencyFindings,
  buildEffortEstimate,
  upstreamStamp,
  type ReviewReport,
} from '@archivato/shared';
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
  COST_ESTIMATE_REPOSITORY,
  type CostEstimateRepository,
} from '../cost-estimate/cost-estimate.repository';
import { ReviewerAgent } from '../llm/agents/reviewer.agent';
import {
  REVIEW_REPORT_REPOSITORY,
  type ReviewReportRepository,
} from './review-report.repository';

@Injectable()
export class ReviewService {
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
    @Inject(COST_ESTIMATE_REPOSITORY)
    private readonly estimates: CostEstimateRepository,
    @Inject(REVIEW_REPORT_REPOSITORY)
    private readonly reports: ReviewReportRepository,
    private readonly reviewer: ReviewerAgent,
  ) {}

  /**
   * Generate (or regenerate) the review report. Requires the entire pipeline to
   * have run: confirmed interview, requirements, system, database, and API
   * designs (the Reviewer critiques the whole system).
   */
  async generate(sessionId: string): Promise<ReviewReport> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException('Review requires a confirmed interview.');
    }

    const apiDesign = await this.apiDesigns.findBySessionId(sessionId);
    if (!apiDesign) {
      throw new ConflictException(
        'Generate the API design before running the review.',
      );
    }

    const [requirements, systemDesign, databaseDesign, costEstimate] =
      await Promise.all([
        this.requirements.findBySessionId(sessionId),
        this.systemDesigns.findBySessionId(sessionId),
        this.databaseDesigns.findBySessionId(sessionId),
        this.estimates.findBySessionId(sessionId),
      ]);
    if (!requirements || !systemDesign || !databaseDesign) {
      throw new ConflictException('Upstream design artifacts are missing.');
    }

    // R10 — deterministic cross-artifact consistency (A2). All pure code, so it
    // runs regardless of the LLM: the effort is derived from the design, the
    // timeline/constraints from the interview slots, and the cost lines from the
    // (possibly stale) cost estimate. The reviewer merges these into the report.
    const effort = buildEffortEstimate(systemDesign);
    const timelineSlot = session.slots?.timeline;
    const timeline =
      timelineSlot && !timelineSlot.na ? timelineSlot.value : undefined;
    const constraintSlot = session.slots?.constraints;
    const constraints = [
      ...(requirements.constraints ?? []),
      ...(constraintSlot && !constraintSlot.na && constraintSlot.value
        ? [constraintSlot.value]
        : []),
    ];
    const automatedConsistency = buildConsistencyFindings({
      effort,
      timeline,
      constraints,
      constraintCompliance: systemDesign.constraintCompliance,
      buildVsBuy: systemDesign.buildVsBuy,
      serviceSubscriptions: costEstimate?.serviceSubscriptions,
    });

    const report = await this.reviewer.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
      slots: session.slots,
      effort,
      automatedConsistency,
    });

    return this.reports.upsert({
      ...report,
      sourceStamp: upstreamStamp('review', {
        requirements: requirements.generatedAt,
        systemDesign: systemDesign.generatedAt,
        databaseDesign: databaseDesign.generatedAt,
        apiDesign: apiDesign.generatedAt,
      }),
    });
  }

  async get(sessionId: string): Promise<ReviewReport> {
    const report = await this.reports.findBySessionId(sessionId);
    if (!report) {
      throw new NotFoundException(
        `No review report for session ${sessionId}. Generate it first.`,
      );
    }
    return report;
  }
}
