import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SystemDesign } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from '../requirements/requirement-document.repository';
import { SystemArchitectAgent } from '../llm/agents/system-architect.agent';
import {
  SYSTEM_DESIGN_REPOSITORY,
  type SystemDesignRepository,
} from './system-design.repository';

@Injectable()
export class SystemDesignService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirements: RequirementDocumentRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly designs: SystemDesignRepository,
    private readonly architect: SystemArchitectAgent,
  ) {}

  /**
   * Generate (or regenerate) the system design. Requires a confirmed interview
   * AND a generated requirement document (the pipeline order: Requirements →
   * System Design).
   */
  async generate(sessionId: string): Promise<SystemDesign> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'System design requires a confirmed interview.',
      );
    }

    const requirements =
      await this.requirements.findBySessionId(sessionId);
    if (!requirements) {
      throw new ConflictException(
        'Generate the requirement document before the system design.',
      );
    }

    const design = await this.architect.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
    });

    return this.designs.upsert(design);
  }

  async get(sessionId: string): Promise<SystemDesign> {
    const design = await this.designs.findBySessionId(sessionId);
    if (!design) {
      throw new NotFoundException(
        `No system design for session ${sessionId}. Generate it first.`,
      );
    }
    return design;
  }
}
