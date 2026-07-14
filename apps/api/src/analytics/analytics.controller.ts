import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { redactSharePath, redactShareReferrer } from '@archivato/shared';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { resolveCountryFromRequest } from '../common/geo';

/** Anonymous visitor cookie (1-year, httpOnly) — scopes unique-visitor counts. */
const VISITOR_COOKIE = 'archivato_vid';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;


/**
 * Public analytics beacon. The web fires `POST /analytics/track` on each page
 * load (including anonymous landing traffic), so this route is intentionally
 * unguarded. The server stamps an anonymous visitor id + timestamp; recording is
 * best-effort and never fails the request.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('track')
  @HttpCode(204)
  async track(
    @Body() dto: TrackEventDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const visitorId = this.ensureVisitorId(req, res);
    await this.analytics.recordSafe({
      type: 'pageview',
      // Share tokens are bearer credentials and must never be stored (see
      // `redactSharePath`). The web beacon already redacts; this route is public
      // and unauthenticated, so its body is attacker-chosen — redact again here.
      path: redactSharePath(dto.path.slice(0, 1024)),
      // A visitor navigating away from a share page sends that page's URL —
      // token and all — as the referrer, so it gets the same treatment.
      referrer: dto.referrer
        ? redactShareReferrer(dto.referrer.slice(0, 1024))
        : null,
      visitorId,
      country: resolveCountryFromRequest(req),
    });
  }

  /** Read the visitor cookie, minting + setting one on first visit. */
  private ensureVisitorId(req: Request, res: Response): string {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const existing = cookies?.[VISITOR_COOKIE];
    if (existing) return existing;

    const id = randomUUID();
    res.cookie(VISITOR_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: VISITOR_COOKIE_MAX_AGE,
      path: '/',
    });
    return id;
  }
}
