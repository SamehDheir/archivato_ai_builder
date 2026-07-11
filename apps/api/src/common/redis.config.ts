import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * One place to resolve Redis connection options, shared by BullMQ (`jobs`) and
 * the readiness probe (`health`) so they can never drift apart.
 *
 * **Managed Redis** (Upstash, Render Key Value, …) hands you a single URL that
 * carries the credentials and TLS:
 *   `rediss://default:<password>@fine-cat-12345.upstash.io:6379`
 * A bare host/port — which is all this used to support — cannot authenticate to
 * any of them, so `REDIS_URL` takes precedence when set.
 *
 * **Local `docker compose`** has no password and no TLS, so the host/port
 * fallback keeps dev + tests zero-config.
 */
export function redisConnectionOptions(config: ConfigService): RedisOptions {
  const url = config.get<string>('REDIS_URL');
  if (!url) {
    return {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get('REDIS_PORT') ?? 6379),
    };
  }

  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: decodeURIComponent(parsed.username) || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    // `rediss://` means TLS — the scheme every managed provider issues. The SNI
    // servername must be the hostname or the handshake fails.
    ...(parsed.protocol === 'rediss:'
      ? { tls: { servername: parsed.hostname } }
      : {}),
  };
}
