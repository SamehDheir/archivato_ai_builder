import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { ProjectDiagrams } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { DiagramsService } from './diagrams.service';

/** Architecture diagrams (Mermaid) — owner-scoped like the rest of the pipeline. */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('diagrams')
export class DiagramsController {
  constructor(private readonly diagrams: DiagramsService) {}

  /** The full diagram set for a project (Mermaid source per diagram). */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ProjectDiagrams> {
    return this.diagrams.forSession(sessionId);
  }
}
