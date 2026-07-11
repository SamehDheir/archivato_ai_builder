import type { Request } from 'express';
import {
  countryFromHeaders,
  normalizeCountry,
  resolveCountryFromRequest,
} from './geo';

describe('normalizeCountry', () => {
  it('uppercases and trims a valid alpha-2 code', () => {
    expect(normalizeCountry('de')).toBe('DE');
    expect(normalizeCountry('  us ')).toBe('US');
  });

  it('rejects empty / non-alpha-2 values', () => {
    expect(normalizeCountry(null)).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry('USA')).toBeNull();
    expect(normalizeCountry('1')).toBeNull();
    expect(normalizeCountry('u1')).toBeNull();
  });

  it('rejects edge placeholder codes (unknown / anonymizers)', () => {
    for (const c of ['XX', 'ZZ', 'T1', 'A1', 'AP', 'EU']) {
      expect(normalizeCountry(c)).toBeNull();
    }
  });
});

describe('countryFromHeaders', () => {
  it('reads the Cloudflare header', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': 'FR' })).toBe('FR');
  });

  it('reads the Vercel header (and normalizes casing)', () => {
    expect(countryFromHeaders({ 'x-vercel-ip-country': 'jp' })).toBe('JP');
  });

  it('skips a placeholder header value and tries the next source', () => {
    expect(
      countryFromHeaders({ 'cf-ipcountry': 'XX', 'x-vercel-ip-country': 'GB' }),
    ).toBe('GB');
  });

  it('handles an array header value', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': ['SA', 'US'] })).toBe('SA');
  });

  it('returns null when no country header is present', () => {
    expect(countryFromHeaders({ 'user-agent': 'x' })).toBeNull();
  });
});

describe('resolveCountryFromRequest', () => {
  const req = (
    headers: Record<string, string | string[] | undefined>,
    ip?: string,
  ) => ({ headers, ip }) as unknown as Request;

  const originalTrustProxy = process.env.TRUST_PROXY;
  afterEach(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  it('prefers the CDN header when behind a trusted proxy', () => {
    process.env.TRUST_PROXY = 'true';
    expect(
      resolveCountryFromRequest(req({ 'cf-ipcountry': 'DE' }, '8.8.8.8')),
    ).toBe('DE');
  });

  it('IGNORES a country header when no trusted proxy is configured', () => {
    // Direct-to-origin, the header is attacker-controlled: a client can send
    // `cf-ipcountry: DE` on the public waitlist/analytics routes. Without a
    // trusted edge we must not believe it.
    delete process.env.TRUST_PROXY;
    expect(
      resolveCountryFromRequest(req({ 'cf-ipcountry': 'DE' }, '127.0.0.1')),
    ).toBeNull();
  });

  it('returns null for a localhost / private IP with no header', () => {
    // 127.0.0.1 / ::1 have no country in geoip either, so this holds whether or
    // not the optional geoip-lite module is installed.
    expect(resolveCountryFromRequest(req({}, '127.0.0.1'))).toBeNull();
    expect(resolveCountryFromRequest(req({}, '::1'))).toBeNull();
  });

  it('never throws on a malformed request', () => {
    expect(() =>
      resolveCountryFromRequest(req({}, undefined)),
    ).not.toThrow();
  });
});
