import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
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
const STATE_COOKIE_PATH = '/api/auth/oauth';
const VALID: OAuthProvider[] = ['google', 'github'];

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
  start(@Param('provider') provider: string, @Res() res: Response): void {
    const p = this.requireProvider(provider);
    if (!this.oauth.isEnabled(p)) {
      return void res.redirect(this.webError('oauth_unavailable'));
    }
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, {
      ...this.stateCookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
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
    // Always clear the one-time state cookie.
    res.clearCookie(STATE_COOKIE, this.stateCookieOptions());

    if (!code || !state || !cookieState || state !== cookieState) {
      return void res.redirect(this.webError('oauth_state'));
    }

    try {
      const user = await this.oauth.loginWithCode(p, code);
      const session = await this.auth.createSessionFor(user);
      setAuthCookies(res, this.config, session, this.tokens.accessTtlSeconds);
      res.redirect(this.webOrigin());
    } catch (err) {
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
