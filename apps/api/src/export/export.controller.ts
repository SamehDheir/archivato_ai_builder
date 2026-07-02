import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import type { ExportBundle, ProjectStructure } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { ExportService } from './export.service';

// Export is the Pro deliverable — every format is gated behind an active plan.
@UseGuards(JwtAuthGuard, SessionOwnerGuard, ProGuard)
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

  /** GitHub-ready project structure manifest. */
  @Get(':sessionId/structure')
  structure(
    @Param('sessionId') sessionId: string,
  ): Promise<ProjectStructure> {
    return this.exporter.structure(sessionId);
  }
}
