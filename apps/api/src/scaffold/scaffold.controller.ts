import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthUser, GithubPushResult, ScaffoldManifest } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { THROTTLE_EXTERNAL } from '../common/throttling';
import { ScaffoldService } from './scaffold.service';
import { PushToGithubDto } from './dto/push-to-github.dto';

/**
 * Code scaffolding — the Pro deliverable that turns the design into a runnable
 * NestJS + Prisma backend. Owner-scoped and Pro-gated (same as export); the
 * design must be complete through the API design (409 otherwise, from bundle()).
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard, ProGuard)
@Controller('scaffold')
export class ScaffoldController {
  constructor(private readonly scaffold: ScaffoldService) {}

  /** File manifest (paths + contents) for the UI preview. */
  @Get(':sessionId')
  manifest(
    @Param('sessionId') sessionId: string,
  ): Promise<ScaffoldManifest> {
    return this.scaffold.manifest(sessionId);
  }

  /** Download the scaffold as a .zip archive. */
  @Get(':sessionId/zip')
  async zip(
    @Param('sessionId') sessionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.scaffold.zip(sessionId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="scaffold-${sessionId}.zip"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  /** Create a GitHub repo and push the scaffold (PAT used once, never stored). */
  @Post(':sessionId/github')
  @Throttle(THROTTLE_EXTERNAL)
  pushToGithub(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PushToGithubDto,
  ): Promise<GithubPushResult> {
    return this.scaffold.pushToGithub(sessionId, user.id, dto);
  }
}
