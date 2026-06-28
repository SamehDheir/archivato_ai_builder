import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExportBundle, ProjectStructure } from '@archivato/shared';
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
import {
  REVIEW_REPORT_REPOSITORY,
  type ReviewReportRepository,
} from '../review/review-report.repository';
import { buildMarkdown } from './markdown.builder';
import { buildOpenApi } from './openapi.builder';
import { buildProjectStructure } from './structure.builder';

@Injectable()
export class ExportService {
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
    @Inject(REVIEW_REPORT_REPOSITORY)
    private readonly reviews: ReviewReportRepository,
  ) {}

  /** The complete artifact bundle (also the JSON export). Review is optional. */
  async bundle(sessionId: string): Promise<ExportBundle> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }

    const [requirements, systemDesign, databaseDesign, apiDesign, review] =
      await Promise.all([
        this.requirements.findBySessionId(sessionId),
        this.systemDesigns.findBySessionId(sessionId),
        this.databaseDesigns.findBySessionId(sessionId),
        this.apiDesigns.findBySessionId(sessionId),
        this.reviews.findBySessionId(sessionId),
      ]);

    // The design pipeline must be complete through the API design.
    if (!requirements || !systemDesign || !databaseDesign || !apiDesign) {
      throw new ConflictException(
        'Complete the pipeline through the API design before exporting.',
      );
    }

    return {
      sessionId,
      generatedAt: new Date().toISOString(),
      idea: session.input,
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
      review: review ?? null,
    };
  }

  async markdown(sessionId: string): Promise<string> {
    return buildMarkdown(await this.bundle(sessionId));
  }

  async openapi(sessionId: string): Promise<Record<string, unknown>> {
    const b = await this.bundle(sessionId);
    return buildOpenApi(b.idea.idea, b.apiDesign, b.databaseDesign);
  }

  async structure(sessionId: string): Promise<ProjectStructure> {
    const b = await this.bundle(sessionId);
    return buildProjectStructure(sessionId, b.idea.idea, b.systemDesign);
  }
}
