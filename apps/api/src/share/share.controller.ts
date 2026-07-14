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
import { ShareService } from './share.service';

/**
 * Owner-facing management of a project's public link. Every route is
 * owner-scoped (a non-owner 404s, no existence leak).
 *
 * **No `ProGuard` anywhere.** Sharing is free on every plan: the public page is
 * the product's organic loop, and paywalling the thing that brings in new
 * visitors taxes the only free users who are actively marketing us. Export stays
 * Pro — that's the deliverable the customer keeps; the link is the one they hand
 * out. The gate that remains is the design itself (`ShareService.create` 409s
 * until the database design exists).
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

  /** Mint a link (idempotent — returns the existing one). Free on every plan. */
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
