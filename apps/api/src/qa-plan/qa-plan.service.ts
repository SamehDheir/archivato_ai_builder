import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { upstreamStamp, type QaPlan } from '@archivato/shared';
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
import { QaPlannerAgent } from '../llm/agents/qa-planner.agent';
import {
  QA_PLAN_REPOSITORY,
  type QaPlanRepository,
} from './qa-plan.repository';

@Injectable()
export class QaPlanService {
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
    @Inject(QA_PLAN_REPOSITORY)
    private readonly plans: QaPlanRepository,
    private readonly planner: QaPlannerAgent,
  ) {}

  /**
   * Generate (or regenerate) the test/QA plan. Requires the full pipeline
   * (confirmed interview + requirements, system, database, and API designs)
   * since the plan is tied to services, endpoints, and requirements. Standalone:
   * it does not gate the design pipeline.
   */
  async generate(sessionId: string): Promise<QaPlan> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException('The QA plan requires a confirmed interview.');
    }

    const apiDesign = await this.apiDesigns.findBySessionId(sessionId);
    if (!apiDesign) {
      throw new ConflictException(
        'Generate the API design before the QA plan.',
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

    const plan = await this.planner.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
    });

    return this.plans.upsert({
      ...plan,
      sourceStamp: upstreamStamp('qa-plan', {
        requirements: requirements.generatedAt,
        systemDesign: systemDesign.generatedAt,
        databaseDesign: databaseDesign.generatedAt,
        apiDesign: apiDesign.generatedAt,
      }),
    });
  }

  async get(sessionId: string): Promise<QaPlan> {
    const plan = await this.plans.findBySessionId(sessionId);
    if (!plan) {
      throw new NotFoundException(
        `No QA plan for session ${sessionId}. Generate it first.`,
      );
    }
    return plan;
  }
}
