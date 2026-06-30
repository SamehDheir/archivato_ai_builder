import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ApiDesign } from '@archivato/shared';
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
import { ApiDesignerAgent } from '../llm/agents/api-designer.agent';
import {
  API_DESIGN_REPOSITORY,
  type ApiDesignRepository,
} from './api-design.repository';

@Injectable()
export class ApiDesignService {
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
    private readonly designer: ApiDesignerAgent,
  ) {}

  /**
   * Generate (or regenerate) the API design. Requires the full upstream chain:
   * confirmed interview, requirement document, system design, and database
   * design (pipeline order: Database Design → API Design).
   */
  async generate(sessionId: string): Promise<ApiDesign> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'API design requires a confirmed interview.',
      );
    }

    const databaseDesign =
      await this.databaseDesigns.findBySessionId(sessionId);
    if (!databaseDesign) {
      throw new ConflictException(
        'Generate the database design before the API design.',
      );
    }

    const systemDesign = await this.systemDesigns.findBySessionId(sessionId);
    const requirements = await this.requirements.findBySessionId(sessionId);
    if (!systemDesign || !requirements) {
      throw new ConflictException('Upstream design artifacts are missing.');
    }

    const design = await this.designer.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
      systemDesign,
      databaseDesign,
    });

    return this.apiDesigns.upsert(design);
  }

  async get(sessionId: string): Promise<ApiDesign> {
    const design = await this.apiDesigns.findBySessionId(sessionId);
    if (!design) {
      throw new NotFoundException(
        `No API design for session ${sessionId}. Generate it first.`,
      );
    }
    return design;
  }

  /** Persist a user-edited API design (must already exist). */
  async save(
    sessionId: string,
    edited: Omit<ApiDesign, 'sessionId' | 'generatedAt'>,
  ): Promise<ApiDesign> {
    const existing = await this.apiDesigns.findBySessionId(sessionId);
    if (!existing) {
      throw new ConflictException('Generate the API design before editing it.');
    }
    return this.apiDesigns.upsert({
      ...edited,
      sessionId,
      generatedAt: new Date().toISOString(),
    });
  }
}
