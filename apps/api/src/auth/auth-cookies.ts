import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from './auth.constants';
import type { AuthSession } from './auth.service';

/**
 * httpOnly cookie wiring. The refresh cookie is scoped to the auth routes so it
 * is never sent on ordinary API calls; the access cookie is sent site-wide so
 * the guard can read it on any protected route.
 */
const REFRESH_COOKIE_PATH = '/api/auth';

function baseOptions(config: ConfigService): CookieOptions {
  // Cross-site cookies (different domains in prod) require SameSite=None+Secure.
  const sameSite = config.get<CookieOptions['sameSite']>('COOKIE_SAMESITE', 'lax');
  const secure =
    config.get<string>('COOKIE_SECURE', '') === 'true' ||
    config.get<string>('NODE_ENV') === 'production';
  return { httpOnly: true, sameSite, secure };
}

/** Set both auth cookies from a fresh session. */
export function setAuthCookies(
  res: Response,
  config: ConfigService,
  session: AuthSession,
  accessTtlSeconds: number,
): void {
  const base = baseOptions(config);
  res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
    ...base,
    path: '/',
    maxAge: accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, session.refresh.raw, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    expires: session.refresh.expiresAt,
  });
}

/** Clear both auth cookies (logout). */
export function clearAuthCookies(res: Response, config: ConfigService): void {
  const base = baseOptions(config);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}
