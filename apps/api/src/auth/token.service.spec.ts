import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { InMemoryRefreshTokenRepository } from './in-memory-refresh-token.repository';

/** Decode a JWT payload without verifying (test-only). */
function decode(token: string): { iat: number; exp: number } {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

describe('TokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });

  function make(ttl: unknown) {
    const config = new ConfigService({ JWT_ACCESS_TTL_SECONDS: ttl });
    return new TokenService(jwt, config, new InMemoryRefreshTokenRepository());
  }

  it('treats a STRING ttl from env as seconds, not milliseconds', () => {
    // Regression: env values are strings; "900" must mean 900s, not 900ms.
    const tokens = make('900');
    expect(tokens.accessTtlSeconds).toBe(900);

    const { iat, exp } = decode(
      tokens.signAccessToken({ id: 'u1', email: 'a@b.c' }),
    );
    expect(exp - iat).toBe(900);
  });

  it('falls back to 900s when ttl is unset or invalid', () => {
    expect(make(undefined).accessTtlSeconds).toBe(900);
    expect(make('').accessTtlSeconds).toBe(900);
    expect(make('not-a-number').accessTtlSeconds).toBe(900);
  });

  it('honours a numeric ttl', () => {
    const { iat, exp } = decode(
      make(120).signAccessToken({ id: 'u1', email: 'a@b.c' }),
    );
    expect(exp - iat).toBe(120);
  });
});
