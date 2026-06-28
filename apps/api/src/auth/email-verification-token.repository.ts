/** DI token for the email-verification-token store. */
export const EMAIL_VERIFICATION_TOKEN_REPOSITORY = Symbol(
  'EMAIL_VERIFICATION_TOKEN_REPOSITORY',
);

/**
 * A stored email-verification token. We persist only the SHA-256 `tokenHash`;
 * the raw value travels in the emailed link. Single-use (consumed once).
 */
export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface CreateEmailVerificationTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Persistence seam for email-verification tokens (Repository pattern). */
export interface EmailVerificationTokenRepository {
  create(
    input: CreateEmailVerificationTokenInput,
  ): Promise<EmailVerificationTokenRecord>;
  findByHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null>;
  consume(id: string): Promise<void>;
  /** Invalidate any outstanding tokens for a user (before issuing a new one). */
  consumeAllForUser(userId: string): Promise<void>;
}
