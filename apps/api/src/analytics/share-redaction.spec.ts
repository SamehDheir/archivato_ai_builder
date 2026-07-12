import { redactSharePath, redactShareReferrer } from '@archivato/shared';

/**
 * A share token is a bearer credential: `GET /shared/:token` is unauthenticated,
 * so anyone holding it reads the design. It must never reach `analytics_events`,
 * which the admin "Top pages" panel renders verbatim to any holder of
 * `admin:analytics` — a role with no project access whatsoever. Both the web
 * beacon and the API's receipt of it call these helpers.
 */
describe('share-token redaction (analytics)', () => {
  const TOKEN = 'kHhK1Zt3s6vQ9wXyZ0aBcDeFgHiJkLmNoPqRsTuVwXy';

  it('collapses a share path to its route', () => {
    expect(redactSharePath(`/s/${TOKEN}`)).toBe('/s/[token]');
  });

  it('leaves ordinary paths untouched', () => {
    for (const path of ['/', '/dashboard', '/support/kb/abc', '/settings']) {
      expect(redactSharePath(path)).toBe(path);
    }
  });

  it('does not mistake a same-prefix route for a share link', () => {
    expect(redactSharePath('/settings')).toBe('/settings');
    expect(redactSharePath('/support')).toBe('/support');
  });

  it('strips the token from an absolute referrer, keeping the origin', () => {
    expect(redactShareReferrer(`https://archivato.app/s/${TOKEN}`)).toBe(
      'https://archivato.app/s/[token]',
    );
  });

  it('strips a token carried alongside a query/hash', () => {
    const out = redactShareReferrer(
      `https://archivato.app/s/${TOKEN}?utm=x#frag`,
    );
    expect(out).not.toContain(TOKEN);
    expect(out).toBe('https://archivato.app/s/[token]');
  });

  it('keeps a non-share referrer intact', () => {
    expect(
      redactShareReferrer('https://news.ycombinator.com/item?id=1'),
    ).toBe('https://news.ycombinator.com/item?id=1');
  });

  it('still redacts when the referrer is not a parseable URL', () => {
    expect(redactShareReferrer(`/s/${TOKEN}`)).toBe('/s/[token]');
  });
});
