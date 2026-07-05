import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailVerificationService,
  hashToken,
} from './email-verification.service';
import { MailService } from './mail.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { InMemoryEmailVerificationTokenRepository } from './in-memory-email-verification-token.repository';
import { RoleService } from '../roles/role.service';
import { InMemoryRoleRepository } from '../roles/in-memory-role.repository';

describe('EmailVerificationService', () => {
  let users: InMemoryUserRepository;
  let tokenRepo: InMemoryEmailVerificationTokenRepository;
  let mail: MailService;
  let sent: { to: string; url: string }[];
  let service: EmailVerificationService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    tokenRepo = new InMemoryEmailVerificationTokenRepository();
    const config = new ConfigService({ WEB_ORIGIN: 'http://localhost:3000' });
    mail = new MailService(config);
    // Capture the link instead of sending (no SMTP configured anyway).
    sent = [];
    jest
      .spyOn(mail, 'sendVerificationEmail')
      .mockImplementation(async (to, url) => {
        sent.push({ to, url });
      });
    service = new EmailVerificationService(
      users,
      tokenRepo,
      mail,
      config,
      new RoleService(new InMemoryRoleRepository()),
    );
  });

  async function newUser() {
    return users.create({
      email: 'user@example.com',
      passwordHash: 'x',
      displayName: 'User',
      providers: ['password'],
    });
  }

  /** Pull the raw token out of the captured verification URL. */
  function lastToken(): string {
    const url = new URL(sent[sent.length - 1].url);
    return url.searchParams.get('token') ?? '';
  }

  it('issues a token, emails a link, and stores only its hash', async () => {
    const user = await newUser();
    await service.issueAndSend(user);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('user@example.com');
    const raw = lastToken();
    expect(raw.length).toBeGreaterThan(0);

    // The raw token is never stored; only its hash is.
    expect(await tokenRepo.findByHash(raw)).toBeNull();
    expect(await tokenRepo.findByHash(hashToken(raw))).not.toBeNull();
  });

  it('verifies a valid token and flips emailVerified', async () => {
    const user = await newUser();
    await service.issueAndSend(user);

    const result = await service.verify(lastToken());
    expect(result.emailVerified).toBe(true);

    const stored = await users.findById(user.id);
    expect(stored?.emailVerified).toBe(true);
  });

  it('rejects an unknown or empty token', async () => {
    await expect(service.verify('')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verify('nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is single-use: a consumed token cannot be reused', async () => {
    const user = await newUser();
    await service.issueAndSend(user);
    const raw = lastToken();

    await service.verify(raw);
    await expect(service.verify(raw)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('invalidates older tokens when a new one is issued', async () => {
    const user = await newUser();
    await service.issueAndSend(user);
    const firstToken = lastToken();

    await service.issueAndSend(user);

    // The first link no longer works after re-issuing.
    await expect(service.verify(firstToken)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resend refuses once the email is already verified', async () => {
    const user = await newUser();
    await users.save({ ...user, emailVerified: true });
    await expect(service.resend(user.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
