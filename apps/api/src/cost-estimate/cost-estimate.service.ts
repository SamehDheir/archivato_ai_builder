import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildBudgetCheck,
  buildEffortEstimate,
  buildServiceCostLines,
  estimateCosts,
  REFERENCE_RATES,
  upstreamStamp,
  type CostEstimate,
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
} from './cost-estimate.repository';

@Injectable()
export class CostEstimateService {
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
  ) {}

  /**
   * Generate (or regenerate) the cost estimate. Requires the full design
   * (confirmed interview + system, database, and API designs) since the workload
   * is derived from the actual services/entities/endpoints. The dollar figures
   * come from a **deterministic** model (`estimateCosts`) — no LLM — so they're
   * stable across runs. Standalone: it does not gate the design pipeline.
   */
  async generate(sessionId: string): Promise<CostEstimate> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'The cost estimate requires a confirmed interview.',
      );
    }

    const apiDesign = await this.apiDesigns.findBySessionId(sessionId);
    if (!apiDesign) {
      throw new ConflictException(
        'Generate the API design before estimating costs.',
      );
    }

    const [systemDesign, databaseDesign, requirements] = await Promise.all([
      this.systemDesigns.findBySessionId(sessionId),
      this.databaseDesigns.findBySessionId(sessionId),
      this.requirements.findBySessionId(sessionId),
    ]);
    if (!systemDesign || !databaseDesign) {
      throw new ConflictException('Upstream design artifacts are missing.');
    }

    const endpoints = apiDesign.modules.reduce(
      (n, m) => n + m.endpoints.length,
      0,
    );

    // R9 economics — all deterministic (no LLM). Effort + service subscriptions
    // are client-facing; the budget warning is OWNER-ONLY (the share view()
    // strips it). `budget_range` comes from the interview slot snapshot; a target
    // market slot doesn't exist yet, so the regional PSP note stays dormant.
    const effort = buildEffortEstimate(systemDesign);
    const serviceSubscriptions = buildServiceCostLines(systemDesign, {
      targetMarket: undefined,
    });
    const budgetSlot = session.slots?.budget_range;
    const budgetText = budgetSlot && !budgetSlot.na ? budgetSlot.value : undefined;
    const budgetWarning = buildBudgetCheck(effort, budgetText, REFERENCE_RATES, {
      hasMvpPhase: !!systemDesign.phasedArchitecture,
      hasOutOfScope: !!requirements?.outOfScope?.length,
    });

    const estimate: CostEstimate = {
      sessionId,
      generatedAt: new Date().toISOString(),
      ...estimateCosts({
        sessionId,
        services: systemDesign.services.length,
        entities: databaseDesign.entities.length,
        endpoints,
        databaseType: databaseDesign.databaseType,
        architecture: systemDesign.architecture,
      }),
      effort,
      serviceSubscriptions,
      budgetWarning,
    };

    // The design revision this estimate was derived from — the UI compares it
    // against the current design to flag an estimate that describes an older one.
    // Requirements are read above ONLY for the budget warning's out-of-scope hint
    // (a boolean), so they're deliberately kept OUT of the stamp: the estimate's
    // figures derive from the designs, and flagging a whole (deterministic)
    // estimate stale over a lagging hint line would nag more than it helps.
    return this.estimates.upsert({
      ...estimate,
      sourceStamp: upstreamStamp('cost-estimate', {
        systemDesign: systemDesign.generatedAt,
        databaseDesign: databaseDesign.generatedAt,
        apiDesign: apiDesign.generatedAt,
      }),
    });
  }

  async get(sessionId: string): Promise<CostEstimate> {
    const estimate = await this.estimates.findBySessionId(sessionId);
    if (!estimate) {
      throw new NotFoundException(
        `No cost estimate for session ${sessionId}. Generate it first.`,
      );
    }
    return estimate;
  }
}
