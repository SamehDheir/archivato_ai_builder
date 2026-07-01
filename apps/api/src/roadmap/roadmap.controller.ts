import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { ProjectRoadmap } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { RoadmapService } from './roadmap.service';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  /** Generate (or regenerate) the implementation roadmap for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<ProjectRoadmap> {
    return this.roadmap.generate(sessionId);
  }

  /** Fetch a previously generated roadmap. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ProjectRoadmap> {
    return this.roadmap.get(sessionId);
  }
}
