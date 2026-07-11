import { ConfigService } from '@nestjs/config';
import { redisConnectionOptions } from './redis.config';

/** A ConfigService stub backed by a plain map. */
const cfg = (values: Record<string, string> = {}) =>
  ({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  }) as unknown as ConfigService;

describe('redisConnectionOptions', () => {
  it('falls back to host/port when no REDIS_URL is set (local docker)', () => {
    expect(redisConnectionOptions(cfg())).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });

  it('honours explicit REDIS_HOST / REDIS_PORT', () => {
    expect(
      redisConnectionOptions(cfg({ REDIS_HOST: 'redis', REDIS_PORT: '6380' })),
    ).toEqual({ host: 'redis', port: 6380 });
  });

  it('parses a managed rediss:// URL with credentials and enables TLS', () => {
    const opts = redisConnectionOptions(
      cfg({ REDIS_URL: 'rediss://default:s3cret@fine-cat.upstash.io:6379' }),
    );
    expect(opts).toMatchObject({
      host: 'fine-cat.upstash.io',
      port: 6379,
      username: 'default',
      password: 's3cret',
      // SNI must be the hostname or the TLS handshake fails.
      tls: { servername: 'fine-cat.upstash.io' },
    });
  });

  it('does NOT enable TLS for a plain redis:// URL', () => {
    const opts = redisConnectionOptions(
      cfg({ REDIS_URL: 'redis://localhost:6379' }),
    );
    expect(opts.tls).toBeUndefined();
    expect(opts).toMatchObject({ host: 'localhost', port: 6379 });
  });

  it('url-decodes a password containing reserved characters', () => {
    // Managed providers hand out passwords with `/`, `+`, `=` — they arrive
    // percent-encoded in the URL and MUST be decoded or auth fails.
    const opts = redisConnectionOptions(
      cfg({ REDIS_URL: 'rediss://default:a%2Fb%2Bc%3D@host.upstash.io:6379' }),
    );
    expect(opts.password).toBe('a/b+c=');
  });

  it('REDIS_URL wins over REDIS_HOST/REDIS_PORT', () => {
    const opts = redisConnectionOptions(
      cfg({
        REDIS_URL: 'rediss://default:pw@managed.upstash.io:6379',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
      }),
    );
    expect(opts.host).toBe('managed.upstash.io');
  });

  it('defaults the port when the URL omits it', () => {
    const opts = redisConnectionOptions(
      cfg({ REDIS_URL: 'rediss://default:pw@host.upstash.io' }),
    );
    expect(opts.port).toBe(6379);
  });
});
