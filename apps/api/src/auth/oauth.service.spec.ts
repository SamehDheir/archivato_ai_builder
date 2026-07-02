import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { InMemoryDeviceRegistrationRepository } from './in-memory-device-registration.repository';

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
  let devices: InMemoryDeviceRegistrationRepository;
  let service: OAuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    devices = new InMemoryDeviceRegistrationRepository();
    const config = new ConfigService({
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'gsecret',
      API_ORIGIN: 'http://localhost:3001',
    });
    service = new OAuthService(config, users, devices);
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
      { email: 'new@example.com', name: 'New User', verified_email: true },
    ]);

    const user = await service.loginWithCode('google', 'code123');
    expect(user.email).toBe('new@example.com');
    expect(user.displayName).toBe('New User');
    expect(user.providers).toEqual(['google']);
    expect(user.emailVerified).toBe(true);
    expect(user.passwordHash).toBeNull();
  });

  it('device-gates a NEW OAuth account (one account per device)', async () => {
    mockFetch([
      { access_token: 'tok' },
      { email: 'first@example.com', name: 'First', verified_email: true },
    ]);
    await service.loginWithCode('google', 'code', 'device-abc');

    // A different new email from the same device is refused.
    mockFetch([
      { access_token: 'tok' },
      { email: 'second@example.com', name: 'Second', verified_email: true },
    ]);
    await expect(
      service.loginWithCode('google', 'code', 'device-abc'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a NEW OAuth account from a different device', async () => {
    mockFetch([
      { access_token: 'tok' },
      { email: 'first@example.com', name: 'First', verified_email: true },
    ]);
    await service.loginWithCode('google', 'code', 'device-abc');

    mockFetch([
      { access_token: 'tok' },
      { email: 'second@example.com', name: 'Second', verified_email: true },
    ]);
    const user = await service.loginWithCode('google', 'code', 'device-xyz');
    expect(user.email).toBe('second@example.com');
  });

  it('does NOT device-gate signing into an existing account', async () => {
    // Occupy the device with one new account.
    mockFetch([
      { access_token: 'tok' },
      { email: 'first@example.com', name: 'First', verified_email: true },
    ]);
    await service.loginWithCode('google', 'code', 'device-abc');

    // A pre-existing local account for a different email.
    await users.create({
      email: 'existing@example.com',
      passwordHash: 'hash',
      displayName: 'Existing',
      providers: ['password'],
    });
    // Signing in with Google to that existing email from the SAME device works
    // (it's a sign-in / provider link, not a new account).
    mockFetch([
      { access_token: 'tok' },
      { email: 'existing@example.com', name: 'Existing', verified_email: true },
    ]);
    const user = await service.loginWithCode('google', 'code', 'device-abc');
    expect(user.email).toBe('existing@example.com');
    expect(user.providers).toEqual(['password', 'google']);
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
      { email: 'me@example.com', name: 'Me', verified_email: true },
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

  it('rejects an UNVERIFIED provider email (account-linking guard)', async () => {
    await users.create({
      email: 'victim@example.com',
      passwordHash: 'hash',
      displayName: 'Victim',
      providers: ['password'],
    });
    mockFetch([
      { access_token: 'tok' },
      { email: 'victim@example.com', name: 'X', verified_email: false },
    ]);
    await expect(service.loginWithCode('google', 'code')).rejects.toThrow();
    // The victim account was NOT linked.
    const victim = await users.findByEmail('victim@example.com');
    expect(victim?.providers).toEqual(['password']);
  });
});
