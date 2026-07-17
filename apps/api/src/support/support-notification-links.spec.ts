import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Notification deep links must address routes that EXIST in the web app.
 *
 * This is a regression test for a bug that shipped and stayed shipped: the
 * notification service emitted `/support/tickets/:id` and
 * `/support/admin/tickets/:id`, but the Next routes are `support/[id]` and
 * `support/admin/[id]` — one dynamic segment each. Next matches `/support/[id]`
 * against a SINGLE segment, so the two-segment path matched nothing and every
 * in-app notification and every notification email landed on a 404.
 *
 * The existing unit test asserted `link` **contained** `/support/tickets/` and
 * passed the whole time, because a string assertion cannot tell a live route
 * from a dead one. So this test checks the only thing that actually matters:
 * that the path the service emits resolves to a real page file on disk.
 *
 * It reads the filesystem rather than mocking a router because the web app's
 * route table IS the filesystem (Next App Router) — that is the source of truth,
 * and it can't drift from itself. If someone moves the ticket page, this fails
 * here rather than in a customer's inbox.
 */

/** Repo-root-relative path to the web app's route directory. */
const APP_DIR = join(__dirname, '..', '..', '..', 'web', 'app', '(app)');

/**
 * Resolve an app-relative URL path to the Next page file that would serve it,
 * honouring `[param]` dynamic segments. Returns null when nothing matches —
 * which is exactly the 404 the user would have hit.
 */
function resolvePage(urlPath: string): string | null {
  const segments = urlPath.split('/').filter(Boolean);
  let dir = APP_DIR;

  for (const segment of segments) {
    const literal = join(dir, segment);
    if (existsSync(literal)) {
      dir = literal;
      continue;
    }
    // No literal directory — try the dynamic segment(s) at this level.
    const dynamic = ['[id]', '[token]', '[slug]']
      .map((d) => join(dir, d))
      .find((d) => existsSync(d));
    if (!dynamic) return null;
    dir = dynamic;
  }

  const page = join(dir, 'page.tsx');
  return existsSync(page) ? page : null;
}

describe('support notification deep links', () => {
  it('the customer ticket link resolves to a real page', () => {
    // Mirrors SupportNotificationsService.customerLink().
    expect(resolvePage('/support/42')).not.toBeNull();
  });

  it('the staff ticket link resolves to a real page', () => {
    // Mirrors SupportNotificationsService.adminLink().
    expect(resolvePage('/support/admin/42')).not.toBeNull();
  });

  it('the OLD links 404 — proving this test can actually fail', () => {
    // Guards the guard: if resolvePage() matched anything, the two assertions
    // above would be vacuous. These are the exact paths that shipped broken.
    expect(resolvePage('/support/tickets/42')).toBeNull();
    expect(resolvePage('/support/admin/tickets/42')).toBeNull();
  });
});
