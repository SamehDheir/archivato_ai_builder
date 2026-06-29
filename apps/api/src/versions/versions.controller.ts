import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  ProjectSnapshot,
  ProjectVersionDetail,
  ProjectVersionMeta,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { VersionsService } from './versions.service';

/** Project version history — owner-scoped like the rest of the pipeline. */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('versions')
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  /** List a project's versions (newest first). */
  @Get(':sessionId')
  list(@Param('sessionId') sessionId: string): Promise<ProjectVersionMeta[]> {
    return this.versions.list(sessionId);
  }

  /** Fetch one version with its full snapshot (used for compare). */
  @Get(':sessionId/:version')
  get(
    @Param('sessionId') sessionId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ProjectVersionDetail> {
    return this.versions.get(sessionId, version);
  }

  /** Restore the project to a version; returns the restored snapshot. */
  @Post(':sessionId/:version/restore')
  restore(
    @Param('sessionId') sessionId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ProjectSnapshot> {
    return this.versions.restore(sessionId, version);
  }
}
