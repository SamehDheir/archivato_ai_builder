import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@archivato/shared';
import { USER_REPOSITORY, type UserRepository } from './user.repository';
import type { User } from './user.entity';
import { MailService } from './mail.service';
import { toAuthUser } from './user.mapper';
import { RoleService } from '../roles/role.service';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type EmailVerificationTokenRepository,
} from './email-verification-token.repository';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Email verification (Slice 9b). Issues single-use tokens, emails the
 * confirmation link, and flips `emailVerified` when a valid token is presented.
 * Only the SHA-256 hash of each token is stored.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokens: EmailVerificationTokenRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly roles: RoleService,
  ) {}

  /** Create a fresh token (invalidating prior ones) and email the link. */
  async issueAndSend(user: User): Promise<void> {
    if (user.emailVerified) return;
    await this.tokens.consumeAllForUser(user.id);

    const raw = randomBytes(32).toString('hex');
    await this.tokens.create({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const base = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
    const verifyUrl = `${base}/verify?token=${raw}`;
    await this.mail.sendVerificationEmail(user.email, verifyUrl);
  }

  /** Confirm a token from the emailed link and mark the email verified. */
  async verify(rawToken: string): Promise<AuthUser> {
    if (!rawToken) throw new BadRequestException('Missing token');

    const record = await this.tokens.findByHash(hashToken(rawToken));
    if (
      !record ||
      record.consumedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    await this.tokens.consume(record.id);

    const user = await this.users.findById(record.userId);
    if (!user) throw new UnauthorizedException();

    const updated = user.emailVerified
      ? user
      : await this.users.save({ ...user, emailVerified: true });
    return toAuthUser(updated, await this.roles.resolveAccess(updated.id));
  }

  /** Re-send the verification email to a signed-in, still-unverified user. */
  async resend(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (user.emailVerified) {
      throw new ConflictException('Email is already verified');
    }
    await this.issueAndSend(user);
  }
}

/** SHA-256 of a raw token — what we store, never the raw value. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
