import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService, hashToken } from './token.service';
import { MailService } from './mail.service';
import { EmailVerificationService } from './email-verification.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { InMemoryRefreshTokenRepository } from './in-memory-refresh-token.repository';
import { InMemoryEmailVerificationTokenRepository } from './in-memory-email-verification-token.repository';

const REGISTER = {
  email: 'Founder@Example.com',
  password: 'hunter2-strong',
  displayName: 'Founder',
};

describe('AuthService', () => {
  let users: InMemoryUserRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let tokens: TokenService;
  let service: AuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    refreshTokens = new InMemoryRefreshTokenRepository();
    const jwt = new JwtService({ secret: 'test-secret' });
    const config = new ConfigService({
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_DAYS: 7,
    });
    tokens = new TokenService(jwt, config, refreshTokens);
    // No SMTP / no MAIL_PREVIEW configured → MailService logs instead of sending.
    const emailVerification = new EmailVerificationService(
      users,
      new InMemoryEmailVerificationTokenRepository(),
      new MailService(config),
      config,
    );
    service = new AuthService(
      users,
      new PasswordService(),
      tokens,
      emailVerification,
    );
  });

  it('registers a user, normalizes email, and never returns the hash', async () => {
    const session = await service.register(REGISTER);

    expect(session.user.email).toBe('founder@example.com');
    expect(session.user.displayName).toBe('Founder');
    expect(session.user.providers).toEqual(['password']);
    // New accounts start unverified until they confirm via the emailed link.
    expect(session.user.emailVerified).toBe(false);
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refresh.raw).toEqual(expect.any(String));
    // The public user shape carries no password material.
    expect(
      (session.user as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
  });

  it('rejects a duplicate email (case-insensitive)', async () => {
    await service.register(REGISTER);
    await expect(
      service.register({ ...REGISTER, email: 'founder@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores only a hash of the refresh token, not the raw value', async () => {
    const session = await service.register(REGISTER);
    const stored = await refreshTokens.findByHash(hashToken(session.refresh.raw));
    expect(stored).not.toBeNull();
    // Raw value must not be persisted directly.
    expect(await refreshTokens.findByHash(session.refresh.raw)).toBeNull();
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await service.register(REGISTER);

    const ok = await service.login({
      email: 'founder@example.com',
      password: REGISTER.password,
    });
    expect(ok.user.email).toBe('founder@example.com');

    await expect(
      service.login({ email: 'founder@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gives the same error for unknown email and wrong password (no enumeration)', async () => {
    await service.register(REGISTER);
    const unknown = await service
      .login({ email: 'nobody@example.com', password: 'whatever12' })
      .then(() => null)
      .catch((e: Error) => e);
    const wrong = await service
      .login({ email: 'founder@example.com', password: 'whatever12' })
      .then(() => null)
      .catch((e: Error) => e);
    expect(unknown?.message).toBe(wrong?.message);
  });

  it('rotates the refresh token and revokes the old one', async () => {
    const session = await service.register(REGISTER);
    const oldRaw = session.refresh.raw;

    const rotated = await service.refresh(oldRaw);
    expect(rotated.refresh.raw).not.toBe(oldRaw);
    expect(rotated.accessToken).toEqual(expect.any(String));

    // The old token can no longer be used (single-use rotation).
    await expect(service.refresh(oldRaw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown refresh token', async () => {
    await expect(service.refresh('not-a-real-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the refresh token on logout', async () => {
    const session = await service.register(REGISTER);
    await service.logout(session.refresh.raw);
    await expect(service.refresh(session.refresh.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('getUser returns the public user and 401s for unknown ids', async () => {
    const session = await service.register(REGISTER);
    const fetched = await service.getUser(session.user.id);
    expect(fetched.id).toBe(session.user.id);
    await expect(service.getUser('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
