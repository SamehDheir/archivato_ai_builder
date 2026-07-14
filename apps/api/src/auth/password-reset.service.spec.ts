import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { MailService } from './mail.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { InMemoryRefreshTokenRepository } from './in-memory-refresh-token.repository';
import { InMemoryPasswordResetTokenRepository } from './in-memory-password-reset-token.repository';

describe('PasswordResetService', () => {
  let users: InMemoryUserRepository;
  let resetTokens: InMemoryPasswordResetTokenRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let passwords: PasswordService;
  let sentCodes: { to: string; code: string }[];
  let service: PasswordResetService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    resetTokens = new InMemoryPasswordResetTokenRepository();
    refreshTokens = new InMemoryRefreshTokenRepository();
    passwords = new PasswordService();
    const mail = new MailService(new ConfigService({}));
    sentCodes = [];
    jest
      .spyOn(mail, 'sendPasswordResetOtp')
      .mockImplementation(async (to, code) => {
        sentCodes.push({ to, code });
      });
    service = new PasswordResetService(
      users,
      resetTokens,
      refreshTokens,
      passwords,
      mail,
    );
  });

  async function seedUser() {
    return users.create({
      email: 'user@example.com',
      passwordHash: await passwords.hash('oldpassword'),
      displayName: 'User',
      providers: ['password'],
    });
  }

  const lastCode = () => sentCodes[sentCodes.length - 1].code;

  it('emails a 6-digit code when the account exists', async () => {
    await seedUser();
    await service.request('user@example.com');
    expect(sentCodes).toHaveLength(1);
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it('does nothing (and does not throw) for an unknown email', async () => {
    await service.request('nobody@example.com');
    expect(sentCodes).toHaveLength(0);
  });

  it('resets the password with a valid code and revokes sessions', async () => {
    const user = await seedUser();
    await refreshTokens.create({
      userId: user.id,
      tokenHash: 'rt',
      expiresAt: new Date(Date.now() + 1000),
    });

    await service.request('user@example.com');
    await service.reset('user@example.com', lastCode(), 'newpassword123');

    const updated = await users.findById(user.id);
    expect(await passwords.compare('newpassword123', updated!.passwordHash!)).toBe(
      true,
    );
    expect(updated!.emailVerified).toBe(true);
    // Session revoked (logout-all).
    expect((await refreshTokens.findByHash('rt'))?.revokedAt ?? null).not.toBeNull();
    // Code is single-use.
    await expect(
      service.reset('user@example.com', lastCode(), 'another123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a wrong code and locks out after too many attempts', async () => {
    await seedUser();
    await service.request('user@example.com');

    for (let i = 0; i < 5; i++) {
      await expect(
        service.reset('user@example.com', '000000', 'newpassword123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    // After max attempts the token is consumed — even the correct code fails.
    await expect(
      service.reset('user@example.com', lastCode(), 'newpassword123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired code', async () => {
    const user = await seedUser();
    // Insert an already-expired token directly.
    await resetTokens.create({
      userId: user.id,
      codeHash: createHash('sha256').update('123456').digest('hex'),
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      service.reset('user@example.com', '123456', 'newpassword123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not reveal whether the email exists on reset', async () => {
    await expect(
      service.reset('nobody@example.com', '123456', 'newpassword123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
