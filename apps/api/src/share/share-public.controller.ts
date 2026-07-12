import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { SharedProject } from '@archivato/shared';
import { ShareService } from './share.service';

/**
 * The public, unauthenticated read of a shared design. Separate controller (and
 * path prefix) from the owner's `/share` routes so a token can never collide
 * with a session id on the same route table.
 *
 * **Un-throttled on purpose** (the Paddle-webhook precedent). The web app renders
 * this page server-side, so every viewer's request reaches the API from the same
 * Next.js server IP — IP-keyed throttling would put the whole audience of a link
 * in one bucket and start 429ing real readers at exactly the moment a link takes
 * off. What protects the route instead: the token is 32 CSPRNG bytes (nothing to
 * enumerate), the response is a read-only projection, and burst protection
 * belongs at the edge (see the Cloudflare note in DEPLOY.md).
 */
@SkipThrottle()
@Controller('shared')
export class SharePublicController {
  constructor(private readonly share: ShareService) {}

  /** Resolve a share token to its read-only project. 404 when revoked/unknown. */
  @Get(':token')
  view(@Param('token') token: string): Promise<SharedProject> {
    return this.share.view(token);
  }
}
