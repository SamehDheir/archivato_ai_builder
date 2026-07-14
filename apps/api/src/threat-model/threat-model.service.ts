import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { upstreamStamp, type ThreatModel } from '@archivato/shared';
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
import { ThreatModelerAgent } from '../llm/agents/threat-modeler.agent';
import {
  THREAT_MODEL_REPOSITORY,
  type ThreatModelRepository,
} from './threat-model.repository';

@Injectable()
export class ThreatModelService {
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
    @Inject(THREAT_MODEL_REPOSITORY)
    private readonly models: ThreatModelRepository,
    private readonly modeler: ThreatModelerAgent,
  ) {}

  /**
   * Generate (or regenerate) the STRIDE threat model. Requires the full pipeline
   * (confirmed interview + requirements, system, database, and API designs)
   * since the analysis inspects roles, entities, and endpoints. Standalone: it
   * does not gate the design pipeline.
   */
  async generate(sessionId: string): Promise<ThreatModel> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'The threat model requires a confirmed interview.',
      );
    }

    const apiDesign = await this.apiDesigns.findBySessionId(sessionId);
    if (!apiDesign) {
      throw new ConflictException(
        'Generate the API design before the threat model.',
      );
    }

    const [requirements, systemDesign, databaseDesign] = await Promise.all([
      this.requirements.findBySessionId(sessionId),
      this.systemDesigns.findBySessionId(sessionId),
      this.databaseDesigns.findBySessionId(sessionId),
    ]);
    if (!requirements || !systemDesign || !databaseDesign) {
      throw new ConflictException('Upstream design artifacts are missing.');
    }

    const model = await this.modeler.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
    });

    return this.models.upsert({
      ...model,
      sourceStamp: upstreamStamp('threat-model', {
        requirements: requirements.generatedAt,
        systemDesign: systemDesign.generatedAt,
        databaseDesign: databaseDesign.generatedAt,
        apiDesign: apiDesign.generatedAt,
      }),
    });
  }

  async get(sessionId: string): Promise<ThreatModel> {
    const model = await this.models.findBySessionId(sessionId);
    if (!model) {
      throw new NotFoundException(
        `No threat model for session ${sessionId}. Generate it first.`,
      );
    }
    return model;
  }
}
