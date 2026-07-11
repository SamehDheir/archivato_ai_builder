import type { Request } from 'express';

/**
 * Best-effort visitor country (ISO-3166-1 alpha-2) from a request.
 *
 * Hybrid resolution, cheapest first:
 *   1. a **CDN/edge country header** (Cloudflare `cf-ipcountry`, Vercel
 *      `x-vercel-ip-country`, …) — free, no dependency, accurate in production
 *      behind such an edge;
 *   2. an **offline `geoip-lite` lookup** on the real client IP — only used when
 *      the header is absent, and only if the (optional) module is installed.
 *
 * `geoip-lite` is an **optional dependency** loaded lazily: behind a CDN the
 * header short-circuits and the ~150 MB database is never required into memory,
 * and a production image built with `npm ci --omit=optional` simply falls back to
 * header-only (no crash). `GEOIP_FALLBACK=false` force-disables the fallback.
 * Returns `null` when nothing resolves (localhost, non-CDN host) — never throws.
 */

/** CDN/edge country headers, in priority order (values are alpha-2). */
const COUNTRY_HEADERS = [
  'cf-ipcountry', // Cloudflare
  'x-vercel-ip-country', // Vercel
  'x-country-code', // some reverse proxies
  'x-geo-country',
];

/** Placeholder codes edges use for unknown / anonymizers — treat as no country. */
const UNKNOWN_CODES = new Set(['XX', 'ZZ', 'T1', 'A1', 'A2', 'O1', 'AP', 'EU']);

/** Narrow a candidate to a real ISO-3166-1 alpha-2 code, or null. */
export function normalizeCountry(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return UNKNOWN_CODES.has(code) ? null : code;
}

/** Country from a CDN/edge header, if present + valid. Pure (testable). */
export function countryFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  for (const name of COUNTRY_HEADERS) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const code = normalizeCountry(value);
    if (code) return code;
  }
  return null;
}

/** Minimal shape we use from geoip-lite (avoids a hard type dependency). */
type GeoipModule = { lookup(ip: string): { country?: string } | null };

let geoipResolved = false;
let geoip: GeoipModule | null = null;

/** Lazily load the optional geoip-lite module once (null if absent/disabled). */
function loadGeoip(): GeoipModule | null {
  if (geoipResolved) return geoip;
  geoipResolved = true;
  if (process.env.GEOIP_FALLBACK === 'false') return (geoip = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    geoip = require('geoip-lite') as GeoipModule;
  } catch {
    geoip = null; // optional dependency not installed (e.g. --omit=optional)
  }
  return geoip;
}

/** Strip an IPv4-mapped IPv6 prefix so geoip-lite can match the address. */
function normalizeIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Whether an edge/proxy in front of us is trusted to set request headers.
 *
 * A `cf-ipcountry` header is only meaningful if a CDN both **sets and strips**
 * it. Direct-to-origin, any client can send `cf-ipcountry: DE` on the public
 * `POST /waitlist` or `POST /analytics/track` and poison the stored geography.
 * `TRUST_PROXY` is already the app's "we're behind a trusted proxy" signal (it
 * also makes `req.ip` the real client IP for the throttler — see `main.ts`), so
 * reuse it: no trusted edge ⇒ ignore the headers and fall through to geoip.
 */
function edgeIsTrusted(): boolean {
  return Boolean(process.env.TRUST_PROXY);
}

/** Resolve a request's country (trusted edge header first, then geoip). */
export function resolveCountryFromRequest(req: Request): string | null {
  try {
    if (edgeIsTrusted()) {
      const fromHeader = countryFromHeaders(req.headers);
      if (fromHeader) return fromHeader;
    }
    const lib = loadGeoip();
    if (!lib) return null;
    const ip = normalizeIp(req.ip);
    if (!ip) return null;
    return normalizeCountry(lib.lookup(ip)?.country);
  } catch {
    return null; // geolocation is never allowed to break a request
  }
}
