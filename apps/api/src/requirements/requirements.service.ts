import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RequirementDocument } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from './requirement-document.repository';

@Injectable()
export class RequirementsService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly docs: RequirementDocumentRepository,
    private readonly engineer: RequirementEngineerAgent,
  ) {}

  /**
   * Generate (or regenerate) the requirement document for a session. The
   * interview must be confirmed first — requirements may not precede the gate.
   */
  async generate(sessionId: string): Promise<RequirementDocument> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'Requirements can only be generated after the interview is confirmed.',
      );
    }
    if (!session.summary) {
      throw new ConflictException('Session has no requirements summary.');
    }

    const doc = await this.engineer.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      history: session.history,
      summary: session.summary,
    });

    return this.docs.upsert(doc);
  }

  async get(sessionId: string): Promise<RequirementDocument> {
    const doc = await this.docs.findBySessionId(sessionId);
    if (!doc) {
      throw new NotFoundException(
        `No requirement document for session ${sessionId}. Generate it first.`,
      );
    }
    return doc;
  }
}
