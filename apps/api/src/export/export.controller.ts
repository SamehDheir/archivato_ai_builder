import {
  All,
  Controller,
  Get,
  Header,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ExportBundle, ProjectStructure } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { ExportService } from './export.service';
import { ExportAnalyticsInterceptor } from './export-analytics.interceptor';

// Export is the Pro deliverable — every format is gated behind an active plan.
@UseGuards(JwtAuthGuard, SessionOwnerGuard, ProGuard)
// One chokepoint for the funnel's `export` step — see the interceptor for why
// it is not nine `recordSafe` calls (and why the mock route is excluded).
@UseInterceptors(ExportAnalyticsInterceptor)
@Controller('export')
export class ExportController {
  constructor(private readonly exporter: ExportService) {}

  /** Full artifact bundle as JSON. */
  @Get(':sessionId/json')
  json(@Param('sessionId') sessionId: string): Promise<ExportBundle> {
    return this.exporter.bundle(sessionId);
  }

  /** Human-readable Markdown document. */
  @Get(':sessionId/markdown')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  markdown(@Param('sessionId') sessionId: string): Promise<string> {
    return this.exporter.markdown(sessionId);
  }

  /** OpenAPI 3.0 specification (JSON). */
  @Get(':sessionId/openapi')
  openapi(
    @Param('sessionId') sessionId: string,
  ): Promise<Record<string, unknown>> {
    return this.exporter.openapi(sessionId);
  }

  /** The same OpenAPI 3.0 specification serialized as YAML. */
  @Get(':sessionId/openapi.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  openapiYaml(@Param('sessionId') sessionId: string): Promise<string> {
    return this.exporter.openapiYaml(sessionId);
  }

  /** GitHub-ready project structure manifest. */
  @Get(':sessionId/structure')
  structure(
    @Param('sessionId') sessionId: string,
  ): Promise<ProjectStructure> {
    return this.exporter.structure(sessionId);
  }

  /** Database design as a runnable PostgreSQL DDL script. */
  @Get(':sessionId/schema.sql')
  @Header('Content-Type', 'application/sql; charset=utf-8')
  sql(@Param('sessionId') sessionId: string): Promise<string> {
    return this.exporter.sqlDdl(sessionId);
  }

  /** API design as an importable Postman collection (v2.1). */
  @Get(':sessionId/postman')
  postman(
    @Param('sessionId') sessionId: string,
  ): Promise<Record<string, unknown>> {
    return this.exporter.postman(sessionId);
  }

  /** Every export format bundled into a single downloadable `.zip`. */
  @Get(':sessionId/all.zip')
  async all(
    @Param('sessionId') sessionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.exporter.bundleZip(sessionId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="archivato-${sessionId}.zip"`,
    });
    res.send(buffer);
  }

  /**
   * Mock server powering "Try it out" in the API Docs. Catches any method/path
   * under `/export/:sessionId/mock/*`, matches it against the designed endpoints,
   * and returns a schema-derived example response with the right status code.
   */
  @All(':sessionId/mock/*')
  async mock(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown> | null> {
    // The `*` splat captures everything after '/mock/' (Express param '0').
    const rest = (req.params as Record<string, string>)['0'] ?? '';
    const path = '/' + rest.replace(/^\/+/, '').split('?')[0];
    const { status, body } = await this.exporter.mock(
      sessionId,
      req.method,
      path,
    );
    res.status(status);
    return body;
  }
}
