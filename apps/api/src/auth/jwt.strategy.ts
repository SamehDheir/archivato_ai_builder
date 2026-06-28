import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthUser } from '@archivato/shared';
import { ACCESS_TOKEN_COOKIE, type JwtPayload } from './auth.constants';
import { USER_REPOSITORY, type UserRepository } from './user.repository';
import { toAuthUser } from './user.mapper';

/** Pull the access token out of the httpOnly cookie (no Authorization header). */
function cookieExtractor(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

/**
 * Validates the access-token JWT from the cookie and resolves the current user.
 * The resolved `AuthUser` is attached to `req.user` (see `@CurrentUser`).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'dev-insecure-secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return toAuthUser(user);
  }
}
