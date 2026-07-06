/**
 * Rate-limit presets used with `@Throttle(...)` to tighten specific routes above
 * the global default (see `ThrottlerModule` in `app.module.ts`). Each preset
 * overrides the `default` named throttler for the route it decorates; unlisted
 * routes fall back to the global limit. TTLs are in milliseconds.
 *
 * Keying is per-client-IP, so `TRUST_PROXY` must be set when running behind a
 * load balancer/reverse proxy (see `main.ts`) or every request keys off the
 * proxy's IP and shares one bucket.
 */
const MINUTE = 60_000;

/** Credential endpoints (login / register) — blunt brute-force protection. */
export const THROTTLE_AUTH = { default: { limit: 10, ttl: MINUTE } };

/**
 * Endpoints that send an email (forgot-password, resend-verification,
 * reset-password). Kept low over a longer window to prevent inbox bombing and
 * OTP brute-forcing.
 */
export const THROTTLE_EMAIL = { default: { limit: 5, ttl: 15 * MINUTE } };

/** Public marketing waitlist — unauthenticated, so keep it tight. */
export const THROTTLE_WAITLIST = { default: { limit: 5, ttl: MINUTE } };

/**
 * Endpoints that trigger paid LLM calls (support AI, async stage generation).
 * Bounds a single client's spend even with a valid session.
 */
export const THROTTLE_AI = { default: { limit: 15, ttl: MINUTE } };

/**
 * Endpoints that make outbound calls to a third party on the user's behalf
 * (e.g. pushing a scaffold to GitHub). Kept low to bound external-API usage.
 */
export const THROTTLE_EXTERNAL = { default: { limit: 10, ttl: MINUTE } };
