import {
  BadRequestException,
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
import { InMemoryDeviceRegistrationRepository } from './in-memory-device-registration.repository';

const REGISTER = {
  email: 'Founder@Example.com',
  password: 'hunter2-strong',
  displayName: 'Founder',
};

describe('AuthService', () => {
  let users: InMemoryUserRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let devices: InMemoryDeviceRegistrationRepository;
  let tokens: TokenService;
  let service: AuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    refreshTokens = new InMemoryRefreshTokenRepository();
    devices = new InMemoryDeviceRegistrationRepository();
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
      devices,
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

  it('blocks a second registration from the same device (one account per device)', async () => {
    await service.register({ ...REGISTER, fingerprint: 'device-abc' });
    await expect(
      service.register({
        email: 'someone-else@example.com',
        password: 'another-strong-pw',
        displayName: 'Someone Else',
        fingerprint: 'device-abc',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows registration from a different device', async () => {
    await service.register({ ...REGISTER, fingerprint: 'device-abc' });
    const second = await service.register({
      email: 'someone-else@example.com',
      password: 'another-strong-pw',
      displayName: 'Someone Else',
      fingerprint: 'device-xyz',
    });
    expect(second.user.email).toBe('someone-else@example.com');
  });

  it('stores only a hash of the fingerprint, not the raw value', async () => {
    await service.register({ ...REGISTER, fingerprint: 'device-abc' });
    expect(await devices.findByFingerprintHash('device-abc')).toBeNull();
    expect(await devices.findByFingerprintHash(hashToken('device-abc'))).not.toBeNull();
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

  it('updates the display name', async () => {
    const session = await service.register(REGISTER);
    const updated = await service.updateProfile(session.user.id, {
      displayName: 'Renamed Founder',
    });
    expect(updated.displayName).toBe('Renamed Founder');
    expect((await service.getUser(session.user.id)).displayName).toBe(
      'Renamed Founder',
    );
  });

  it('changes the password, revokes old sessions, and issues a fresh one', async () => {
    const session = await service.register(REGISTER);

    const rotated = await service.changePassword(session.user.id, {
      currentPassword: REGISTER.password,
      newPassword: 'brand-new-pw-9',
    });
    // The pre-change refresh token is revoked; the new one works.
    await expect(service.refresh(session.refresh.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(rotated.refresh.raw).toEqual(expect.any(String));
    // The new password logs in; the old one no longer does.
    const ok = await service.login({
      email: REGISTER.email,
      password: 'brand-new-pw-9',
    });
    expect(ok.user.id).toBe(session.user.id);
    await expect(
      service.login({ email: REGISTER.email, password: REGISTER.password }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a password change with the wrong current password', async () => {
    const session = await service.register(REGISTER);
    await expect(
      service.changePassword(session.user.id, {
        currentPassword: 'not-my-password',
        newPassword: 'brand-new-pw-9',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets a first password on an OAuth-only account (no current required)', async () => {
    const oauthUser = await users.create({
      email: 'oauth@example.com',
      passwordHash: null,
      displayName: 'OAuth User',
      emailVerified: true,
      providers: ['google'],
    });
    await service.changePassword(oauthUser.id, { newPassword: 'first-pw-123' });

    const refreshed = await service.getUser(oauthUser.id);
    expect(refreshed.providers).toEqual(['google', 'password']);
    // Local login now works with the new password.
    const ok = await service.login({
      email: 'oauth@example.com',
      password: 'first-pw-123',
    });
    expect(ok.user.id).toBe(oauthUser.id);
  });

  it('deletes the account and invalidates its sessions', async () => {
    const session = await service.register(REGISTER);
    await service.deleteAccount(session.user.id);
    await expect(service.getUser(session.user.id)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.refresh(session.refresh.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
