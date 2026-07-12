import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ShareLink } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ProGuard } from '../billing/pro.guard';
import { ShareService } from './share.service';

/**
 * Owner-facing management of a project's public link. Every route is
 * owner-scoped (a non-owner 404s, no existence leak); **minting** a link is
 * Pro-only, matching the rest of the export surface. Reading and revoking are
 * not Pro-gated on purpose: a user who downgrades must still be able to see and
 * kill a link they already published.
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('share')
export class ShareController {
  constructor(private readonly share: ShareService) {}

  /** The session's current link, or null when it isn't shared. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ShareLink | null> {
    return this.share.get(sessionId);
  }

  /** Mint a link (idempotent — returns the existing one). Pro-gated. */
  @UseGuards(ProGuard)
  @Post(':sessionId')
  create(@Param('sessionId') sessionId: string): Promise<ShareLink> {
    return this.share.create(sessionId);
  }

  /** Revoke the link. The token is deleted and can never be resurrected. */
  @Delete(':sessionId')
  @HttpCode(204)
  revoke(@Param('sessionId') sessionId: string): Promise<void> {
    return this.share.revoke(sessionId);
  }
}
