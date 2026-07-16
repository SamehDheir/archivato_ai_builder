import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildEffortEstimate,
  hasTimelineConflict,
  upstreamStamp,
  type ProjectRoadmap,
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
import {
  API_DESIGN_REPOSITORY,
  type ApiDesignRepository,
} from '../api-design/api-design.repository';
import { RoadmapPlannerAgent } from '../llm/agents/roadmap-planner.agent';
import {
  PROJECT_ROADMAP_REPOSITORY,
  type ProjectRoadmapRepository,
} from './roadmap.repository';

@Injectable()
export class RoadmapService {
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
    @Inject(PROJECT_ROADMAP_REPOSITORY)
    private readonly roadmaps: ProjectRoadmapRepository,
    private readonly planner: RoadmapPlannerAgent,
  ) {}

  /**
   * Generate (or regenerate) the implementation roadmap. Requires the full
   * pipeline (confirmed interview + requirements, system, database, and API
   * designs) since the roadmap sequences the actual services/entities/endpoints.
   * Standalone: it does not gate the design pipeline.
   */
  async generate(sessionId: string): Promise<ProjectRoadmap> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException('The roadmap requires a confirmed interview.');
    }

    const apiDesign = await this.apiDesigns.findBySessionId(sessionId);
    if (!apiDesign) {
      throw new ConflictException(
        'Generate the API design before planning the roadmap.',
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

    // R10 — the effort estimate is deterministic (from the design), so it's
    // always available; the CODE computes each phase's week range from it (the
    // agent only groups modules). A timeline conflict — the low-end effort can't
    // fit the stated deadline — asks the agent for a dual roadmap.
    const effort = buildEffortEstimate(systemDesign);
    const timelineSlot = session.slots?.timeline;
    const timeline =
      timelineSlot && !timelineSlot.na ? timelineSlot.value : undefined;
    const requestDualRoadmap = hasTimelineConflict(effort.weeksMin, timeline);

    const roadmap = await this.planner.generate(sessionId, {
      idea: session.input.idea,
      intent: session.intent,
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
      slots: session.slots,
      effort,
      requestDualRoadmap,
    });

    // Record which design revision this was built from, so the UI can tell the
    // user when a later refine/edit/restore has left it describing a design that
    // no longer exists.
    return this.roadmaps.upsert({
      ...roadmap,
      sourceStamp: upstreamStamp('roadmap', {
        requirements: requirements.generatedAt,
        systemDesign: systemDesign.generatedAt,
        databaseDesign: databaseDesign.generatedAt,
        apiDesign: apiDesign.generatedAt,
      }),
    });
  }

  async get(sessionId: string): Promise<ProjectRoadmap> {
    const roadmap = await this.roadmaps.findBySessionId(sessionId);
    if (!roadmap) {
      throw new NotFoundException(
        `No roadmap for session ${sessionId}. Generate it first.`,
      );
    }
    return roadmap;
  }
}
