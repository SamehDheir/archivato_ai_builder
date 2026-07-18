import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyRequirementsPatch,
  preserveGeneration,
  type OpenQuestion,
  type OutOfScopeItem,
  type PatchSection,
  type RequirementAssumption,
  type RequirementDocument,
} from '@archivato/shared';
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
   * Apply an **approved** review-fix patch (R11) to the named sections. Separate
   * from `save()` on purpose: `save()` deliberately carries the narrative sections
   * (executive summary, out-of-scope, assumptions) over from the stored document,
   * because the structured editor can't express them — which is exactly what a
   * patch to one of those sections needs to overwrite.
   *
   * Stamping a fresh `generatedAt` is what raises the existing staleness flags on
   * every derived stage (review / roadmap / threat model / QA plan), so the owner
   * gets the one-click regenerate they already know. That is the whole downstream
   * cascade, and it is deliberately not reimplemented here.
   *
   * The caller is responsible for having obtained explicit approval — nothing in
   * this method decides to change a document.
   */
  async applyPatch(
    sessionId: string,
    sections: PatchSection[],
  ): Promise<RequirementDocument> {
    const existing = await this.require(sessionId);
    return this.docs.upsert({
      ...applyRequirementsPatch(existing, sections),
      sessionId,
      generatedAt: new Date().toISOString(),
    });
  }

  /**
   * Convert an **approved** review finding into a question for the end client
   * (R11). It lands on the requirement document — its "Assumptions & open
   * questions" section is where the client actually reads it — and deliberately
   * NOT on the interview session.
   *
   * That is the R6 invariant holding: `session.openQuestions` is a *derived cache*
   * of the transcript, always re-derivable from `history[]`. A question the
   * reviewer inferred from the finished documents has no turn behind it, so
   * writing it there would make the cache un-derivable and quietly break the rule
   * every other interview path depends on. (The session is also `confirmed` by the
   * time a review exists, which is exactly when `editSlot` stops accepting writes.)
   *
   * The trade-off is real and accepted: regenerating the requirements re-derives
   * them from the transcript and drops these. A regeneration is a fresh document,
   * the finding is still in the review, and it can be re-converted.
   */
  async appendClientQuestion(
    sessionId: string,
    question: OpenQuestion,
    assumption: RequirementAssumption,
  ): Promise<RequirementDocument> {
    const existing = await this.require(sessionId);
    return this.docs.upsert({
      ...existing,
      openQuestions: [...(existing.openQuestions ?? []), question],
      assumptionsAndOpenQuestions: [
        ...(existing.assumptionsAndOpenQuestions ?? []),
        assumption,
      ],
      sessionId,
      generatedAt: new Date().toISOString(),
    });
  }

  /** Convert an **approved** review finding into an out-of-scope line (R11). */
  async appendOutOfScope(
    sessionId: string,
    item: OutOfScopeItem,
  ): Promise<RequirementDocument> {
    const existing = await this.require(sessionId);
    return this.docs.upsert({
      ...existing,
      outOfScope: [...(existing.outOfScope ?? []), item],
      sessionId,
      generatedAt: new Date().toISOString(),
    });
  }

  private async require(sessionId: string): Promise<RequirementDocument> {
    const existing = await this.docs.findBySessionId(sessionId);
    if (!existing) {
      throw new ConflictException(
        'Generate the requirement document before changing it.',
      );
    }
    return existing;
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
    return this.docs.upsert(
      preserveGeneration(
        {
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
        },
        existing,
      ),
    );
  }
}
