import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildConsistencyFindings,
  buildEffortEstimate,
  resolveHostingChoice,
  upstreamStamp,
  type ReviewReport,
} from '@archivato/shared';
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
    // Everything the package promises to deliver, from the three artifacts that
    // make a promise in the client's own vocabulary — checked against what the
    // document says is excluded.
    // Title AND description: a requirement's title is a headline ("Billing and
    // Payments") while the capability that contradicts an exclusion is usually
    // buried in the sentence ("…and manage insurance claims"). Matching titles
    // alone missed exactly that case on a real project.
    const promisedCapabilities = [
      ...requirements.functional.map((f) => ({
        label: f.title,
        text: `${f.title}. ${f.description ?? ''}`.trim(),
        artifact: 'the functional requirements',
      })),
      ...systemDesign.services.map((s) => ({
        label: s.name,
        text: `${s.name}. ${s.responsibility ?? ''}`.trim(),
        artifact: 'the architecture',
      })),
      ...apiDesign.modules.map((m) => ({
        label: m.name,
        artifact: 'the API design',
      })),
    ];

    const automatedConsistency = buildConsistencyFindings({
      effort,
      timeline,
      constraints,
      constraintCompliance: systemDesign.constraintCompliance,
      buildVsBuy: systemDesign.buildVsBuy,
      serviceSubscriptions: costEstimate?.serviceSubscriptions,
      // Cross-stage hosting agreement. The design's choice is re-read here
      // rather than taken from the estimate, so a *stale* estimate built against
      // a host the architecture has since changed is caught — which is the only
      // way this can still drift now that the reconciliation is fixed.
      designHosting: resolveHostingChoice(systemDesign),
      costHosting: costEstimate?.hosting ?? null,
      outOfScope: requirements.outOfScope,
      promisedCapabilities,
      // These findings wrap values the model wrote (a constraint sentence, an
      // excluded capability) in prose the code composes, and the owner reads them
      // in the review panel. Without this the panel told them, half in each
      // language, that their own document contradicted itself.
      language: resolveArtifactLanguage(session),
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
