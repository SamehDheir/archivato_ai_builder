import type { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { TokenCipher } from '../common/token-cipher';
import { GithubConnectionService } from './github-connection.service';
import type { GithubOAuthService } from './github-oauth.service';
import { InMemoryGithubConnectionRepository } from './github-connection.repository';

function makeService(opts: { enabled?: boolean } = {}) {
  const config = {
    get: (key: string) =>
      key === 'GITHUB_TOKEN_SECRET' ? 'state-and-cipher-secret' : undefined,
  } as unknown as ConfigService;

  const oauth = {
    isEnabled: jest.fn().mockReturnValue(opts.enabled ?? true),
    buildAuthorizeUrl: jest.fn((s: string) => `https://github.com/login?state=${s}`),
    exchangeCode: jest.fn().mockResolvedValue({
      accessToken: 'gho_realtoken',
      login: 'octocat',
      scopes: 'repo',
    }),
  } as unknown as GithubOAuthService;

  const repo = new InMemoryGithubConnectionRepository();
  const cipher = new TokenCipher(config);
  const service = new GithubConnectionService(oauth, cipher, config, repo);
  return { service, oauth, repo, cipher };
}

describe('GithubConnectionService signed state', () => {
  it('round-trips a valid state and recovers the userId', () => {
    const { service } = makeService();
    const { state, cookie } = service.createState('user-1');
    expect(service.verifyState(cookie, state)).toBe('user-1');
  });

  it('rejects a tampered cookie', () => {
    const { service } = makeService();
    const { state, cookie } = service.createState('user-1');
    const tampered = cookie.slice(0, -2) + 'xy';
    expect(() => service.verifyState(tampered, state)).toThrow(BadRequestException);
  });

  it('rejects when the returned state does not match the cookie nonce', () => {
    const { service } = makeService();
    const { cookie } = service.createState('user-1');
    expect(() => service.verifyState(cookie, 'wrong-nonce')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing cookie or state', () => {
    const { service } = makeService();
    expect(() => service.verifyState(undefined, 'x')).toThrow(BadRequestException);
    expect(() => service.verifyState('a.b', undefined)).toThrow(BadRequestException);
  });
});

describe('GithubConnectionService connect / status / disconnect', () => {
  it('stores an ENCRYPTED token on connect (never plaintext)', async () => {
    const { service, repo } = makeService();
    await service.connect('user-1', 'auth-code');

    const record = await repo.findByUserId('user-1');
    expect(record).not.toBeNull();
    expect(record!.githubLogin).toBe('octocat');
    // The raw token must not be stored in the clear.
    expect(record!.tokenEncrypted).not.toContain('gho_realtoken');
  });

  it('resolves (decrypts) the stored token back', async () => {
    const { service } = makeService();
    await service.connect('user-1', 'auth-code');
    expect(await service.resolveToken('user-1')).toBe('gho_realtoken');
  });

  it('returns null token when not connected', async () => {
    const { service } = makeService();
    expect(await service.resolveToken('nobody')).toBeNull();
  });

  it('reports status (available + connected + login)', async () => {
    const { service } = makeService();
    expect(await service.status('user-1')).toEqual({
      available: true,
      connected: false,
      login: undefined,
    });
    await service.connect('user-1', 'auth-code');
    expect(await service.status('user-1')).toEqual({
      available: true,
      connected: true,
      login: 'octocat',
    });
  });

  it('disconnect removes the stored connection', async () => {
    const { service } = makeService();
    await service.connect('user-1', 'auth-code');
    await service.disconnect('user-1');
    expect(await service.resolveToken('user-1')).toBeNull();
  });

  it('reports available:false when the OAuth app is not configured', async () => {
    const { service } = makeService({ enabled: false });
    expect((await service.status('user-1')).available).toBe(false);
  });
});
