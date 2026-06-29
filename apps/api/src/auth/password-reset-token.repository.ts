/** DI token for the password-reset (OTP) store. */
export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol(
  'PASSWORD_RESET_TOKEN_REPOSITORY',
);

/**
 * A stored password-reset OTP. Only the SHA-256 `codeHash` is persisted; the
 * raw 6-digit code travels solely in the email. Single-use, short-lived, with a
 * bounded `attempts` counter.
 */
export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface CreatePasswordResetTokenInput {
  userId: string;
  codeHash: string;
  expiresAt: Date;
}

/** Persistence seam for password-reset OTPs (Repository pattern). */
export interface PasswordResetTokenRepository {
  create(
    input: CreatePasswordResetTokenInput,
  ): Promise<PasswordResetTokenRecord>;
  /** The newest still-active (unconsumed) token for a user, if any. */
  findActiveByUserId(userId: string): Promise<PasswordResetTokenRecord | null>;
  consume(id: string): Promise<void>;
  /** Increment and return the new attempt count. */
  incrementAttempts(id: string): Promise<number>;
  /** Invalidate any outstanding tokens for a user (before issuing a new one). */
  consumeAllForUser(userId: string): Promise<void>;
}
