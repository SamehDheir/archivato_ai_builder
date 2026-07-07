import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildAllDiagrams,
  buildSequenceFlows,
  type ProjectDiagrams,
} from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
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

/**
 * Assembles the architecture diagrams (Mermaid) for a project from its design
 * artifacts. Diagrams whose prerequisite artifact doesn't exist yet come back
 * with a `note` instead of source, so the UI can prompt the user.
 */
@Injectable()
export class DiagramsService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly systemDesigns: SystemDesignRepository,
    @Inject(DATABASE_DESIGN_REPOSITORY)
    private readonly databaseDesigns: DatabaseDesignRepository,
    @Inject(API_DESIGN_REPOSITORY)
    private readonly apiDesigns: ApiDesignRepository,
  ) {}

  async forSession(sessionId: string): Promise<ProjectDiagrams> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }

    const [systemDesign, databaseDesign, apiDesign] = await Promise.all([
      this.systemDesigns.findBySessionId(sessionId),
      this.databaseDesigns.findBySessionId(sessionId),
      this.apiDesigns.findBySessionId(sessionId),
    ]);

    return {
      sessionId,
      generatedAt: new Date().toISOString(),
      diagrams: buildAllDiagrams({ systemDesign, databaseDesign, apiDesign }),
      flows: buildSequenceFlows(apiDesign, systemDesign),
    };
  }
}
