import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import JSZip from 'jszip';
import {
  buildPostmanCollection,
  buildSqlDdl,
  matchApiEndpoint,
  mockResponse,
  toYaml,
  type ExportBundle,
  type MockResponse,
  type ProjectStructure,
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

  /** The same OpenAPI 3.0 spec serialized as YAML (dependency-free). */
  async openapiYaml(sessionId: string): Promise<string> {
    return toYaml(await this.openapi(sessionId));
  }

  /** The database design as a runnable PostgreSQL DDL script. */
  async sqlDdl(sessionId: string): Promise<string> {
    const b = await this.bundle(sessionId);
    return buildSqlDdl(b.databaseDesign);
  }

  /** The API design as an importable Postman collection (v2.1). */
  async postman(sessionId: string): Promise<Record<string, unknown>> {
    const b = await this.bundle(sessionId);
    return buildPostmanCollection(b.idea.idea, b.apiDesign);
  }

  async structure(sessionId: string): Promise<ProjectStructure> {
    const b = await this.bundle(sessionId);
    return buildProjectStructure(sessionId, b.idea.idea, b.systemDesign);
  }

  /**
   * "Download all" — every export format bundled into a single `.zip`. Fetches
   * the pipeline once and derives each artifact from it (no repeated DB reads).
   */
  async bundleZip(sessionId: string): Promise<Buffer> {
    const b = await this.bundle(sessionId);
    const openapi = buildOpenApi(b.idea.idea, b.apiDesign, b.databaseDesign);
    const files: Record<string, string> = {
      'README.md': buildMarkdown(b),
      'bundle.json': JSON.stringify(b, null, 2),
      'openapi.json': JSON.stringify(openapi, null, 2),
      'openapi.yaml': toYaml(openapi),
      'schema.sql': buildSqlDdl(b.databaseDesign),
      'postman_collection.json': JSON.stringify(
        buildPostmanCollection(b.idea.idea, b.apiDesign),
        null,
        2,
      ),
      'structure.json': JSON.stringify(
        buildProjectStructure(sessionId, b.idea.idea, b.systemDesign),
        null,
        2,
      ),
    };

    const archive = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      archive.file(path, content);
    }
    return archive.generateAsync({ type: 'nodebuffer' });
  }

  /**
   * Serve a **mock** response for a designed endpoint — powers "Try it out" in
   * the API Docs. Matches the request method + path against the API design and
   * synthesizes an example success response from the endpoint's schema (no real
   * implementation exists). Only the API design is required.
   */
  async mock(
    sessionId: string,
    method: string,
    path: string,
  ): Promise<MockResponse> {
    const apiDesign = await this.apiDesigns.findBySessionId(sessionId);
    if (!apiDesign) {
      throw new NotFoundException('No API design for this session.');
    }
    const endpoint = matchApiEndpoint(apiDesign, method, path);
    if (!endpoint) {
      throw new NotFoundException(
        `No mocked endpoint matches ${method.toUpperCase()} ${path}.`,
      );
    }
    return mockResponse(endpoint);
  }
}
