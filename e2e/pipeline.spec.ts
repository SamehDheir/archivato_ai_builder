import { test, expect, type Page } from '@playwright/test';

/**
 * Full-funnel smoke: register → interview → confirm → requirements (auto) →
 * system design → database design → hit the freemium wall → mock upgrade →
 * API design → export the JSON bundle.
 *
 * Runs entirely on the deterministic fallbacks (no LLM key) and the mock
 * billing provider (no Paddle key), so it is offline and repeatable. Selectors
 * target the English locale — SSR always renders `en`, and a fresh browser
 * context has no stored locale.
 */

const IDEA =
  'A booking platform for local yoga studios with class schedules, member subscriptions, waitlists, and online payments.';

/** A stage tab by its exact visible label (icon SVGs contribute no text). */
function stageTab(page: Page, label: string) {
  return page
    .getByRole('tab')
    .filter({ hasText: new RegExp(`^${label}$`) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // The one-account-per-device gate hashes stable browser signals, and a
    // fresh Chromium context hashes identically on every run — against a
    // persistent local DB the second run would 409 at registration.
    // Randomizing one signal makes each run read as a new device.
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      get: () => 4 + Math.floor(Math.random() * 1_000_000),
    });
    // Pre-decline the cookie banner so it never overlays controls near the
    // bottom of the viewport (it gates analytics only, not app behavior).
    window.localStorage.setItem('archivato.cookieConsent', 'declined');
  });
});

test('register → interview → design chain → upgrade → export', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  // ---- Register (the form computes the device fingerprint itself) ----
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('E2E Smoke');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('e2e-Password-123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Signed in → a zero-project dashboard shows the idea form directly.
  const ideaBox = page.getByLabel('Project idea');
  await expect(ideaBox).toBeVisible({ timeout: 45_000 });

  // ---- Interview ----
  await ideaBox.fill(IDEA);
  await page.getByRole('button', { name: 'Start interview' }).click();

  const answerBtn = page.getByRole('button', { name: 'Answer', exact: true });
  const confirmBtn = page.getByRole('button', {
    name: 'Confirm requirements',
  });

  // The question card's counter, e.g. "Question 3 of up to 9". It renders from
  // `history.length`, so it only advances once the server has ACCEPTED an answer —
  // the one honest "we moved on" signal.
  const counter = page.getByText(/^Question \d+ of up to \d+$/);

  // Answer until the completeness gate offers the summary (≤ 9 questions).
  // Free-text alone is always a valid answer, even for option questions.
  for (let i = 0; i < 12; i++) {
    await expect(confirmBtn.or(answerBtn).first()).toBeVisible({
      timeout: 60_000,
    });
    if (await confirmBtn.isVisible()) break;

    const asked = await counter.textContent();
    await page
      .locator('textarea')
      .fill(
        `Detail ${i + 1}: solo studios first, about 500 members each, web only, Stripe for payments, email reminders.`,
      );
    await answerBtn.click();

    // Accepted ⇒ either the next question is up (the counter advanced) or the
    // interview closed and the summary replaced the card (confirm is offered).
    //
    // `textContent()` MUST carry its own short timeout. Playwright locators
    // auto-wait, and the counter is exactly the element that disappears at the
    // gate — an unbounded call parks inside the predicate on a node that is never
    // coming back, so the retry loop never gets to re-check `confirmBtn` and burns
    // the whole 60s even though the page is sitting there, confirmed and ready.
    // Nothing inside a `toPass` predicate may block longer than its retry cadence.
    await expect(async () => {
      if (await confirmBtn.isVisible()) return;
      expect(await counter.textContent({ timeout: 2_000 })).not.toBe(asked);
    }).toPass({ timeout: 60_000 });
  }

  // ---- Confirm (auto-generates the requirement document) ----
  await confirmBtn.click();

  // Requirements done ⇒ the System tab unlocks (it stays disabled until the
  // requirement document exists).
  await expect(stageTab(page, 'System')).toBeEnabled({ timeout: 120_000 });

  // Each completed stage shows a "Next: <stage>" action under its artifact.
  const nextBtn = (label: string) =>
    page.getByRole('button', { name: `Next: ${label}` });

  // ---- System design ----
  await stageTab(page, 'System').click();
  await page.getByRole('button', { name: 'Generate System Design' }).click();
  await expect(nextBtn('Database')).toBeVisible({ timeout: 120_000 });

  // ---- Database design ----
  await stageTab(page, 'Database').click();
  await page.getByRole('button', { name: 'Generate Database Design' }).click();
  await expect(nextBtn('API')).toBeVisible({ timeout: 120_000 });

  // ---- Freemium wall on the API tab → in-place mock upgrade ----
  await stageTab(page, 'API').click();
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // CTA reads "Upgrade — $<price>/yr" (annual is the default cycle).
  await dialog.getByRole('button', { name: /\$\d+\/(yr|mo)/ }).click();

  // Mock billing activates instantly; the wall swaps for the generate CTA.
  const generateApi = page.getByRole('button', {
    name: 'Generate API Design',
  });
  await expect(generateApi).toBeVisible({ timeout: 60_000 });

  // ---- API design (Pro) ----
  await generateApi.click();
  await expect(nextBtn('Review')).toBeVisible({ timeout: 120_000 });

  // ---- Export the JSON bundle (Pro) ----
  await expect(stageTab(page, 'Export')).toBeEnabled();
  await stageTab(page, 'Export').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON bundle' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^archivato-.+\.json$/);

  // ---- Public share link (Pro) ----
  await page.getByRole('button', { name: 'Create public link' }).click();
  const linkBox = page.getByRole('textbox', { name: 'Share a public link' });
  await expect(linkBox).toBeVisible({ timeout: 30_000 });
  const shareUrl = await linkBox.inputValue();
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);

  // The whole point of the link: it must render for someone with no account.
  // A brand-new context carries none of this browser's auth cookies.
  const anon = await page.context().browser()!.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(shareUrl);
  // The untitled project falls back to its idea as the heading. Match the string
  // literally — a regex built from IDEA would break the day it grows a `(` or `+`.
  await expect(
    anonPage.getByRole('heading', { level: 1 }),
  ).toHaveText(IDEA, { timeout: 30_000 });
  // Read-only: the design renders, and the page sells the product.
  await expect(anonPage.getByRole('link', { name: 'Build yours free' })).toBeVisible();
  await expect(anonPage.getByRole('tab', { name: 'Database' })).toBeVisible();

  // ---- Revoke → the link is dead for good ----
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await expect(page.getByRole('button', { name: 'Create public link' })).toBeVisible({
    timeout: 30_000,
  });

  await anonPage.goto(shareUrl);
  await expect(
    anonPage.getByRole('heading', { name: /link isn.t available/i }),
  ).toBeVisible({ timeout: 30_000 });
  await anon.close();
});
