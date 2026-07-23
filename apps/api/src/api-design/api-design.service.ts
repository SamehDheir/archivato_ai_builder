import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ensureEntityCoverage,
  preserveGeneration,
  withResolvedCoverage,
  type ApiDesign,
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

    // The invariant lives here, at the only path that writes a generated design:
    // no entity gets persisted without either an endpoint group or a stated
    // reason it has none. The agent tries the model first and repairs what it
    // can; anything still uncovered becomes a deterministic group tagged
    // `generated-fallback`, which the UI flags for review. A generic resource the
    // user can see and fix beats a table with no API and nothing to notice.
    return this.apiDesigns.upsert(ensureEntityCoverage(design, databaseDesign));
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

  /**
   * Persist a user-edited API design (must already exist).
   *
   * Coverage is **recomputed, not enforced**: the editor doesn't expose it, so an
   * edit must not wipe the exclusions (the R7 precedent), and the numbers are
   * re-derived from the modules the user actually kept so the summary can't
   * outlive them. Deliberately no `ensureEntityCoverage` here — silently
   * resurrecting a group the user just deleted would make the editor feel broken.
   * The invariant belongs to generation, which is where designs come from.
   */
  async save(
    sessionId: string,
    edited: Omit<ApiDesign, 'sessionId' | 'generatedAt'>,
  ): Promise<ApiDesign> {
    const existing = await this.apiDesigns.findBySessionId(sessionId);
    if (!existing) {
      throw new ConflictException('Generate the API design before editing it.');
    }
    const databaseDesign = await this.databaseDesigns.findBySessionId(sessionId);
    const design: ApiDesign = preserveGeneration(
      {
        ...edited,
        // `?? existing` rather than a spread order: the DTO leaves the key present
        // and undefined when the editor omits it, which would spread right over the
        // stored exclusions.
        excludedEntities: edited.excludedEntities ?? existing.excludedEntities,
        // Carried over for the same reason, and deliberately NOT recomputed: the
        // owner may be editing a type on purpose, and silently rewriting it back
        // to the schema's would make the editor feel broken — the same call as
        // not re-running `ensureEntityCoverage` here. Regeneration replaces it.
        typeCorrections: existing.typeCorrections,
        sessionId,
        generatedAt: new Date().toISOString(),
      },
      existing,
    );
    return this.apiDesigns.upsert(
      databaseDesign
        ? withResolvedCoverage(
            design,
            (databaseDesign.entities ?? []).map((e) => e.name),
          )
        : design,
    );
  }
}
