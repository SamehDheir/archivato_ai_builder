import { createHash, randomInt } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { USER_REPOSITORY, type UserRepository } from './user.repository';
import { PasswordService } from './password.service';
import { MailService } from './mail.service';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './refresh-token.repository';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from './password-reset-token.repository';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/**
 * Forgot-password via a one-time code (Slice 9b). `request` emails a 6-digit
 * OTP (only its hash is stored); `reset` verifies the OTP and sets a new
 * password, then revokes all sessions. Responses never reveal whether an email
 * exists, and a bounded attempt counter limits guessing of the short code.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokens: PasswordResetTokenRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {}

  /** Email a fresh OTP if the account exists. Always resolves (no enumeration). */
  async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email.trim());
    if (!user) return;

    await this.tokens.consumeAllForUser(user.id);
    const code = generateCode();
    await this.tokens.create({
      userId: user.id,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    // Best-effort: a mail-provider failure must NOT surface here, or the
    // resulting 500 (only reachable for accounts that exist) would let an
    // attacker enumerate registered emails against the always-200 miss path.
    try {
      await this.mail.sendPasswordResetOtp(user.email, code);
    } catch (err) {
      this.logger.error(
        `Failed to send password-reset OTP: ${(err as Error).message}`,
      );
    }
  }

  /** Verify the OTP and set a new password; revokes all existing sessions. */
  async reset(email: string, code: string, newPassword: string): Promise<void> {
    // One generic error for every failure so we don't leak which step failed.
    const invalid = new BadRequestException('Invalid or expired reset code');

    const user = await this.users.findByEmail(email.trim());
    if (!user) throw invalid;

    const token = await this.tokens.findActiveByUserId(user.id);
    if (!token || token.expiresAt.getTime() < Date.now()) throw invalid;
    if (token.attempts >= MAX_ATTEMPTS) {
      await this.tokens.consume(token.id);
      throw invalid;
    }

    if (token.codeHash !== hashCode(code)) {
      const attempts = await this.tokens.incrementAttempts(token.id);
      if (attempts >= MAX_ATTEMPTS) await this.tokens.consume(token.id);
      throw invalid;
    }

    // Success: rotate the password, consume the OTP, and log out everywhere.
    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.save({
      ...user,
      passwordHash,
      // Receiving the OTP proves control of the inbox.
      emailVerified: true,
    });
    await this.tokens.consume(token.id);
    await this.refreshTokens.revokeAllForUser(user.id);
  }
}

/** A uniformly-random 6-digit numeric code, e.g. "047215". */
function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** SHA-256 of the code — what we store, never the raw value. */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
