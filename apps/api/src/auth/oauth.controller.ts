import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { OAuthService, type OAuthProvider } from './oauth.service';
import { setAuthCookies } from './auth-cookies';

const STATE_COOKIE = 'archivato_oauth_state';
// Carries the browser fingerprint from /start to /callback so a NEW OAuth
// account is device-gated like local registration (one account per device).
const FP_COOKIE = 'archivato_oauth_fp';
const STATE_COOKIE_PATH = '/api/auth/oauth';
const VALID: OAuthProvider[] = ['google', 'github'];
/** Guard against an oversized fingerprint query inflating the cookie. */
const MAX_FP_LENGTH = 512;

/**
 * OAuth endpoints (Slice 9c). `/start` redirects to the provider with a CSRF
 * `state`; `/callback` validates state, exchanges the code, links/creates the
 * user, sets the auth cookies, and redirects back to the web app.
 */
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /** Which providers are configured — lets the client show the right buttons. */
  @Get('providers')
  providers(): Record<OAuthProvider, boolean> {
    return this.oauth.enabledProviders();
  }

  @Get(':provider/start')
  start(
    @Param('provider') provider: string,
    @Query('fingerprint') fingerprint: string | undefined,
    @Res() res: Response,
  ): void {
    const p = this.requireProvider(provider);
    if (!this.oauth.isEnabled(p)) {
      return void res.redirect(this.webError('oauth_unavailable'));
    }
    const state = randomBytes(16).toString('hex');
    const cookieOptions = { ...this.stateCookieOptions(), maxAge: 10 * 60 * 1000 };
    res.cookie(STATE_COOKIE, state, cookieOptions);
    // Stash the device fingerprint for the callback (best-effort — a client that
    // can't compute one still completes the flow, just ungated).
    if (fingerprint && fingerprint.length <= MAX_FP_LENGTH) {
      res.cookie(FP_COOKIE, fingerprint, cookieOptions);
    }
    res.redirect(this.oauth.buildAuthorizeUrl(p, state));
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const p = this.requireProvider(provider);
    const cookieState = req.cookies?.[STATE_COOKIE] as string | undefined;
    const fingerprint = req.cookies?.[FP_COOKIE] as string | undefined;
    // Always clear the one-time state + fingerprint cookies.
    res.clearCookie(STATE_COOKIE, this.stateCookieOptions());
    res.clearCookie(FP_COOKIE, this.stateCookieOptions());

    if (!code || !state || !cookieState || state !== cookieState) {
      return void res.redirect(this.webError('oauth_state'));
    }

    try {
      const user = await this.oauth.loginWithCode(p, code, fingerprint);
      const session = await this.auth.createSessionFor(user);
      setAuthCookies(res, this.config, session, this.tokens.accessTtlSeconds);
      // Drop the user straight into the app, not the marketing landing (`/`).
      res.redirect(`${this.webOrigin()}/dashboard`);
    } catch (err) {
      // A device that already has an account → send a specific, friendly code.
      if (err instanceof ConflictException) {
        return void res.redirect(this.webError('oauth_device'));
      }
      // eslint-disable-next-line no-console
      console.error(`OAuth ${p} callback failed:`, err);
      res.redirect(this.webError('oauth_failed'));
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private requireProvider(provider: string): OAuthProvider {
    if (!VALID.includes(provider as OAuthProvider)) {
      throw new BadRequestException(`Unknown OAuth provider "${provider}"`);
    }
    return provider as OAuthProvider;
  }

  private stateCookieOptions(): CookieOptions {
    const secure =
      this.config.get<string>('COOKIE_SECURE', '') === 'true' ||
      this.config.get<string>('NODE_ENV') === 'production';
    return { httpOnly: true, sameSite: 'lax', secure, path: STATE_COOKIE_PATH };
  }

  private webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  private webError(code: string): string {
    return `${this.webOrigin()}/login?error=${code}`;
  }
}
