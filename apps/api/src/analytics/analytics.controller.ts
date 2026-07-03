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
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';

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
      path: dto.path.slice(0, 1024),
      referrer: dto.referrer ? dto.referrer.slice(0, 1024) : null,
      visitorId,
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
