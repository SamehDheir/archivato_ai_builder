/**
 * Fail-fast environment validation, run by `ConfigModule.forRoot({ validate })`
 * at boot. The goal is to make an insecure *production* deploy impossible to
 * start rather than silently insecure — most checks only fire when
 * `NODE_ENV=production`, so local dev and tests stay zero-config.
 *
 * The headline check is the JWT signing secret: the code carries a dev fallback
 * (`dev-insecure-secret`) so local runs need no setup, but that same fallback in
 * production would let anyone forge a valid access token. We refuse to boot.
 */

/** Known dev/example secrets that must never sign real tokens. */
const INSECURE_SECRETS = new Set([
  'dev-insecure-secret',
  'dev-insecure-secret-change-me',
  'change-me',
  'changeme',
  'secret',
  'password',
]);

/** Minimum acceptable length for the JWT signing secret (bytes/chars). */
const MIN_SECRET_LENGTH = 32;

type Env = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? '' : String(v));

/**
 * Validate raw environment variables. Returns the env untouched on success;
 * throws with an aggregated, actionable message on any failure (which aborts
 * startup).
 */
export function validateEnv(env: Env): Env {
  const isProd = str(env.NODE_ENV) === 'production';
  const errors: string[] = [];

  // ── JWT signing secret (production only) ──────────────────────────────────
  const secret = str(env.JWT_ACCESS_SECRET);
  if (isProd) {
    if (!secret) {
      errors.push(
        'JWT_ACCESS_SECRET is required in production. Generate one with: ' +
          '`openssl rand -base64 48`.',
      );
    } else if (INSECURE_SECRETS.has(secret)) {
      errors.push(
        'JWT_ACCESS_SECRET is a well-known development default and would let ' +
          'anyone forge access tokens. Set a unique secret.',
      );
    } else if (secret.length < MIN_SECRET_LENGTH) {
      errors.push(
        `JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters ` +
          `(got ${secret.length}).`,
      );
    }
  }

  // ── Cookie flags (any environment) ────────────────────────────────────────
  // Browsers reject `SameSite=None` cookies that are not also `Secure`, so this
  // combination would silently break auth (and is a misconfiguration anywhere).
  const sameSite = str(env.COOKIE_SAMESITE).toLowerCase();
  const secureCookies = str(env.COOKIE_SECURE) === 'true' || isProd;
  if (sameSite === 'none' && !secureCookies) {
    errors.push(
      'COOKIE_SAMESITE=none requires Secure cookies (browsers drop it ' +
        'otherwise). Set COOKIE_SECURE=true, or run behind HTTPS with ' +
        'NODE_ENV=production.',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      'Invalid environment configuration:\n  - ' + errors.join('\n  - '),
    );
  }

  return env;
}
