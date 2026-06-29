import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import { InMemoryUserRepository } from './in-memory-user.repository';

/** Script global.fetch to return a sequence of JSON bodies. */
function mockFetch(bodies: unknown[]) {
  let i = 0;
  (global as { fetch: unknown }).fetch = jest.fn(async () => {
    const body = bodies[i++];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
}

describe('OAuthService', () => {
  const realFetch = global.fetch;
  let users: InMemoryUserRepository;
  let service: OAuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    const config = new ConfigService({
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'gsecret',
      API_ORIGIN: 'http://localhost:3001',
    });
    service = new OAuthService(config, users);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reports which providers are configured', () => {
    expect(service.enabledProviders()).toEqual({ google: true, github: false });
    expect(service.isEnabled('google')).toBe(true);
    expect(service.isEnabled('github')).toBe(false);
  });

  it('builds an authorize URL with the required params', () => {
    const url = new URL(service.buildAuthorizeUrl('google', 'xyz'));
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('gid');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/api/auth/oauth/google/callback',
    );
    expect(url.searchParams.get('scope')).toContain('email');
  });

  it('creates a new, email-verified, password-less account', async () => {
    mockFetch([
      { access_token: 'tok' },
      { email: 'new@example.com', name: 'New User' },
    ]);

    const user = await service.loginWithCode('google', 'code123');
    expect(user.email).toBe('new@example.com');
    expect(user.displayName).toBe('New User');
    expect(user.providers).toEqual(['google']);
    expect(user.emailVerified).toBe(true);
    expect(user.passwordHash).toBeNull();
  });

  it('links the provider onto an existing account (by email)', async () => {
    const existing = await users.create({
      email: 'me@example.com',
      passwordHash: 'hash',
      displayName: 'Me',
      providers: ['password'],
    });
    mockFetch([
      { access_token: 'tok' },
      { email: 'me@example.com', name: 'Me' },
    ]);

    const user = await service.loginWithCode('google', 'code');
    expect(user.id).toBe(existing.id);
    expect(user.providers).toEqual(['password', 'google']);
    expect(user.emailVerified).toBe(true);
    expect(user.passwordHash).toBe('hash'); // local password preserved
  });

  it('rejects a profile with no email', async () => {
    mockFetch([{ access_token: 'tok' }, { name: 'No Email' }]);
    await expect(service.loginWithCode('google', 'code')).rejects.toThrow();
  });
});
