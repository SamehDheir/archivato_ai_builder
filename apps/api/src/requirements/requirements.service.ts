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
      // Carry the interview's slot snapshot + open questions onto the agent so it
      // can seed the executive summary / out-of-scope and fold the gaps into the
      // assumptions (R6/R7). Both tolerate absence (plan-mode fills neither).
      slots: session.slots ?? undefined,
      openQuestions: session.openQuestions ?? [],
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

  /**
   * Persist a user-edited requirement document. Only an already-generated
   * document may be edited (you can't bypass the pipeline via PUT); the saved
   * artifact's sessionId/generatedAt are stamped server-side.
   */
  async save(
    sessionId: string,
    edited: Omit<RequirementDocument, 'sessionId' | 'generatedAt'>,
  ): Promise<RequirementDocument> {
    const existing = await this.docs.findBySessionId(sessionId);
    if (!existing) {
      throw new ConflictException(
        'Generate the requirement document before editing it.',
      );
    }
    return this.docs.upsert({
      ...edited,
      // The narrative / interview-derived sections (R6/R7) are not part of the
      // structured editor, so an edit must not wipe them: carry them over from
      // the generated document. `openQuestions` in particular is derived from the
      // interview, never user-authored here.
      executiveSummary: existing.executiveSummary,
      outOfScope: existing.outOfScope,
      assumptionsAndOpenQuestions: existing.assumptionsAndOpenQuestions,
      openQuestions: existing.openQuestions,
      sessionId,
      generatedAt: new Date().toISOString(),
    });
  }
}
