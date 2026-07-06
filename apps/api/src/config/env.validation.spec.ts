import { validateEnv } from './env.validation';

/** A minimally-valid production env we can override per-case. */
const prod = (over: Record<string, unknown> = {}) => ({
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  ...over,
});

describe('validateEnv — JWT secret', () => {
  it('passes with a strong secret in production', () => {
    expect(() => validateEnv(prod())).not.toThrow();
  });

  it('throws when the secret is missing in production', () => {
    expect(() => validateEnv(prod({ JWT_ACCESS_SECRET: undefined }))).toThrow(
      /JWT_ACCESS_SECRET is required/,
    );
  });

  it('throws when the secret is a known dev default', () => {
    expect(() =>
      validateEnv(prod({ JWT_ACCESS_SECRET: 'dev-insecure-secret-change-me' })),
    ).toThrow(/well-known development default/);
  });

  it('throws when the secret is too short', () => {
    expect(() => validateEnv(prod({ JWT_ACCESS_SECRET: 'short' }))).toThrow(
      /at least 32 characters/,
    );
  });

  it('does NOT enforce the secret outside production', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'dev' }),
    ).not.toThrow();
    // No NODE_ENV at all (tests) is also fine.
    expect(() => validateEnv({})).not.toThrow();
  });
});

describe('validateEnv — cookie flags', () => {
  it('rejects SameSite=none without Secure (any env)', () => {
    expect(() =>
      validateEnv({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' }),
    ).toThrow(/requires Secure cookies/);
  });

  it('allows SameSite=none when COOKIE_SECURE=true', () => {
    expect(() =>
      validateEnv({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' }),
    ).not.toThrow();
  });

  it('allows SameSite=none in production (cookies auto-secured)', () => {
    expect(() => validateEnv(prod({ COOKIE_SAMESITE: 'none' }))).not.toThrow();
  });

  it('allows the default SameSite=lax without Secure', () => {
    expect(() => validateEnv({ COOKIE_SAMESITE: 'lax' })).not.toThrow();
  });
});

describe('validateEnv — return value', () => {
  it('returns the env unchanged on success', () => {
    const env = prod({ EXTRA: 'x' });
    expect(validateEnv(env)).toBe(env);
  });

  it('reports failures in the bulleted aggregate format', () => {
    try {
      validateEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short' });
      fail('expected validateEnv to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/^Invalid environment configuration:/);
      expect(msg).toMatch(/\n {2}- .*at least 32 characters/);
    }
  });
});
