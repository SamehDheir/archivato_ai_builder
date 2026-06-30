import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseDesign } from '@archivato/shared';
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
import { DatabaseDesignerAgent } from '../llm/agents/database-designer.agent';
import {
  DATABASE_DESIGN_REPOSITORY,
  type DatabaseDesignRepository,
} from './database-design.repository';

@Injectable()
export class DatabaseDesignService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirements: RequirementDocumentRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly systemDesigns: SystemDesignRepository,
    @Inject(DATABASE_DESIGN_REPOSITORY)
    private readonly databaseDesigns: DatabaseDesignRepository,
    private readonly designer: DatabaseDesignerAgent,
  ) {}

  /**
   * Generate (or regenerate) the database design. Requires the upstream stages:
   * a confirmed interview, a requirement document, and a system design
   * (pipeline order: System Design → Database Design).
   */
  async generate(sessionId: string): Promise<DatabaseDesign> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'Database design requires a confirmed interview.',
      );
    }

    const systemDesign = await this.systemDesigns.findBySessionId(sessionId);
    if (!systemDesign) {
      throw new ConflictException(
        'Generate the system design before the database design.',
      );
    }

    const requirements = await this.requirements.findBySessionId(sessionId);
    if (!requirements) {
      throw new ConflictException('Requirement document is missing.');
    }

    const design = await this.designer.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
      systemDesign,
    });

    return this.databaseDesigns.upsert(design);
  }

  async get(sessionId: string): Promise<DatabaseDesign> {
    const design = await this.databaseDesigns.findBySessionId(sessionId);
    if (!design) {
      throw new NotFoundException(
        `No database design for session ${sessionId}. Generate it first.`,
      );
    }
    return design;
  }

  /** Persist a user-edited database design (must already exist). */
  async save(
    sessionId: string,
    edited: Omit<DatabaseDesign, 'sessionId' | 'generatedAt'>,
  ): Promise<DatabaseDesign> {
    const existing = await this.databaseDesigns.findBySessionId(sessionId);
    if (!existing) {
      throw new ConflictException(
        'Generate the database design before editing it.',
      );
    }
    return this.databaseDesigns.upsert({
      ...edited,
      sessionId,
      generatedAt: new Date().toISOString(),
    });
  }
}
