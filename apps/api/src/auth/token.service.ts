import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from './auth.constants';
import type { User } from './user.entity';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './refresh-token.repository';

/** A freshly minted refresh token: the raw value (cookie) + its expiry. */
export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

/**
 * Mints and validates tokens.
 *  - Access token: a short-lived JWT (HS256), payload { sub, email }.
 *  - Refresh token: an opaque 256-bit random value. Only its SHA-256 hash is
 *    stored; the raw value lives solely in the client's httpOnly cookie.
 *    Rotated on every refresh (old revoked, new issued).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  /**
   * Access-token lifetime in seconds (also used for the cookie maxAge).
   * NOTE: env values arrive as strings; we coerce to a real number so
   * `jsonwebtoken` treats `expiresIn` as SECONDS. A numeric *string* like "900"
   * would be parsed as milliseconds, expiring the token almost immediately.
   */
  get accessTtlSeconds(): number {
    return toNumber(this.config.get('JWT_ACCESS_TTL_SECONDS'), 900);
  }

  /** Refresh-token lifetime in days. */
  get refreshTtlDays(): number {
    return toNumber(this.config.get('JWT_REFRESH_TTL_DAYS'), 7);
  }

  signAccessToken(user: Pick<User, 'id' | 'email'>): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    // Pass a number so expiresIn is interpreted as seconds, not milliseconds.
    return this.jwt.sign(payload, { expiresIn: this.accessTtlSeconds });
  }

  /** Create and persist a new refresh token for a user. */
  async issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.refreshTokens.create({
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
    });
    return { raw, expiresAt };
  }

  /**
   * Validate a presented refresh token and rotate it: revoke the old record and
   * issue a fresh one. Throws 401 if the token is unknown, revoked, or expired.
   */
  async rotateRefreshToken(
    raw: string,
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const record = await this.refreshTokens.findByHash(hashToken(raw));
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.refreshTokens.revoke(record.id);
    const refresh = await this.issueRefreshToken(record.userId);
    return { userId: record.userId, refresh };
  }

  /** Revoke a presented refresh token (logout). No-op if it's unknown. */
  async revokeRefreshToken(raw: string): Promise<void> {
    const record = await this.refreshTokens.findByHash(hashToken(raw));
    if (record) await this.refreshTokens.revoke(record.id);
  }

  /** Revoke every active session for a user (password change / logout-all). */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }
}

/** SHA-256 of a raw token — what we store, never the raw value. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Coerce a config value (often a string from env) to a finite number. */
function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== ''
    ? n
    : fallback;
}
