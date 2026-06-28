/** DI token for the refresh-token store. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

/**
 * A stored refresh token. We persist only the SHA-256 `tokenHash`; the raw
 * token lives solely in the client's httpOnly cookie.
 */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Persistence seam for rotating refresh tokens. Tokens are looked up by hash on
 * refresh, rotated (old one revoked, new one created), and revoked on logout.
 */
export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark a single token revoked (idempotent). */
  revoke(id: string): Promise<void>;
  /** Revoke every active token for a user (logout-all / password reset). */
  revokeAllForUser(userId: string): Promise<void>;
}
