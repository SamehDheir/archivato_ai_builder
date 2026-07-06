import {
  Controller,
  Delete,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthUser, GithubConnectionStatus } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { THROTTLE_EXTERNAL } from '../common/throttling';
import { GithubConnectionService } from './github-connection.service';

const STATE_COOKIE = 'archivato_gh_connect';
const STATE_COOKIE_PATH = '/api/scaffold/github';

/**
 * Stored GitHub connection for one-click scaffold push. The connect flow runs in
 * a popup: `/connect/start` redirects to GitHub with a signed state; the popup
 * lands back on `/connect/callback`, which stores the connection and posts the
 * result to the opener window, then closes itself.
 */
@Controller('scaffold/github')
export class GithubConnectionController {
  constructor(
    private readonly connection: GithubConnectionService,
    private readonly config: ConfigService,
  ) {}

  /** Whether the OAuth app is configured + whether this user is connected. */
  @Get('connection')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser): Promise<GithubConnectionStatus> {
    return this.connection.status(user.id);
  }

  /** Begin the OAuth flow: set a signed state cookie and redirect to GitHub. */
  @Get('connect/start')
  @UseGuards(JwtAuthGuard)
  @Throttle(THROTTLE_EXTERNAL)
  start(@CurrentUser() user: AuthUser, @Res() res: Response): void {
    if (!this.connection.isAvailable()) {
      return void res.redirect(this.popupError('unavailable'));
    }
    const { state, cookie } = this.connection.createState(user.id);
    res.cookie(STATE_COOKIE, cookie, {
      ...this.stateCookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(this.connection.buildAuthorizeUrl(state));
  }

  /** OAuth callback (public — verified by the signed state). Returns popup HTML. */
  @Get('connect/callback')
  @SkipThrottle()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookie = req.cookies?.[STATE_COOKIE] as string | undefined;
    res.clearCookie(STATE_COOKIE, this.stateCookieOptions());

    try {
      if (!code) throw new Error('missing_code');
      const userId = this.connection.verifyState(cookie, state);
      const { login } = await this.connection.connect(userId, code);
      res.type('html').send(this.popupHtml({ ok: true, login }));
    } catch {
      res.type('html').send(this.popupHtml({ ok: false }));
    }
  }

  /** Remove the stored connection. */
  @Delete('connection')
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @CurrentUser() user: AuthUser,
  ): Promise<{ success: true }> {
    await this.connection.disconnect(user.id);
    return { success: true };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private stateCookieOptions(): CookieOptions {
    const secure =
      this.config.get<string>('COOKIE_SECURE', '') === 'true' ||
      this.config.get<string>('NODE_ENV') === 'production';
    return { httpOnly: true, sameSite: 'lax', secure, path: STATE_COOKIE_PATH };
  }

  private webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  /** Minimal HTML that reports the result to the opener and closes the popup. */
  private popupHtml(result: { ok: boolean; login?: string }): string {
    const origin = this.webOrigin();
    // JSON.stringify safely escapes the login for embedding in a script.
    const payload = JSON.stringify({
      source: 'archivato-github',
      ok: result.ok,
      login: result.login ?? null,
    });
    return [
      '<!doctype html><html><head><meta charset="utf-8"><title>GitHub</title></head>',
      '<body style="font-family:system-ui;padding:2rem;text-align:center">',
      `<p>${result.ok ? 'Connected. You can close this window.' : 'Connection failed.'}</p>`,
      '<script>',
      '(function(){',
      `  try { if (window.opener) window.opener.postMessage(${payload}, ${JSON.stringify(origin)}); } catch (e) {}`,
      '  setTimeout(function(){ window.close(); }, 300);',
      '})();',
      '</script></body></html>',
    ].join('\n');
  }

  /** For the pre-redirect failure (app not configured): bounce back as a popup. */
  private popupError(_reason: string): string {
    // Reuse the callback path with no code so it renders the failure popup.
    const base = this.config.get<string>('API_ORIGIN', 'http://localhost:3001');
    return `${base}/api/scaffold/github/connect/callback`;
  }
}
