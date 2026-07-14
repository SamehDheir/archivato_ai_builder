import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { estimateCosts, upstreamStamp, type CostEstimate } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
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

    const [systemDesign, databaseDesign] = await Promise.all([
      this.systemDesigns.findBySessionId(sessionId),
      this.databaseDesigns.findBySessionId(sessionId),
    ]);
    if (!systemDesign || !databaseDesign) {
      throw new ConflictException('Upstream design artifacts are missing.');
    }

    const endpoints = apiDesign.modules.reduce(
      (n, m) => n + m.endpoints.length,
      0,
    );

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
    };

    // The design revision this estimate was derived from — the UI compares it
    // against the current design to flag an estimate that describes an older one.
    // Note the requirements are absent on purpose: this stage never reads them.
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
