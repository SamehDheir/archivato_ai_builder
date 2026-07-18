/**
 * Landing-page constants — the numbers and links that change during customer
 * discovery, kept in one file so they can be edited without touching components.
 *
 * **The price is now sourced from `PLANS`** (`@archivato/shared`), the same
 * constant billing charges from. It used to be an independent literal here, on the
 * theory that the advertised tiers were still being validated and shouldn't touch
 * live billing — and the two promptly drifted: the page advertised $79/mo and
 * "unlimited designs" while billing charged $19/mo for 5 projects. A pricing page
 * that disagrees with the checkout is worse than one that can't be edited freely,
 * so the tier *structure* still lives here (billing has no "Agency" tier to sell)
 * but the number a customer reads is the number they are charged.
 */

import { PLANS } from '@archivato/shared';

/**
 * The "see a real scoping package" proof link is `DEMO_PATH` in `lib/site.ts`.
 *
 * It used to be a `DEMO_SHARE_URL` here, pointing at `/s/demo-scoping-package`
 * unless `NEXT_PUBLIC_DEMO_SHARE_URL` overrode it — a live share **token**, from
 * back when the only way to show a finished package was to keep a real project
 * shared. That override was never set in any environment, so what shipped was
 * the fallback: a token no `share_links` row has ever held, which the share page
 * answers with `ShareNotFound`. The page's primary proof CTA was a 404.
 *
 * `/demo-scoping-package` replaces it and cannot rot the same way — it is a
 * statically prerendered route in this repo, needs no API call and no live
 * project, and renders the same `SharedProjectView` a real link does.
 */

/**
 * Monthly price of the paid tier, as displayed — read from the billing source of
 * truth so the pricing page and the checkout can never disagree. To reprice, edit
 * `PLANS.pro` in `@archivato/shared` (and its `annualPriceUsd`), not this line.
 */
export const TEAM_PRICE = `$${PLANS.pro.priceUsd}`;

/** The tier a landing card renders. `price: null` = the "coming soon" tier. */
export interface LandingPlan {
  key: 'starter' | 'team' | 'agency';
  /** Display price, e.g. "$79". `null` for a free or unreleased tier. */
  price: string | null;
  featured?: boolean;
  /** Greyed out, no CTA — not for sale yet. */
  comingSoon?: boolean;
  /** How many feature bullets to read from `pricing.<key>.features`. */
  featureCount: number;
}

export const LANDING_PLANS: LandingPlan[] = [
  { key: 'starter', price: null, featureCount: 4 },
  { key: 'team', price: TEAM_PRICE, featured: true, featureCount: 5 },
  { key: 'agency', price: null, comingSoon: true, featureCount: 3 },
];

/**
 * Proof screenshots. `src: null` renders a labelled placeholder frame rather than
 * a broken image — drop the file in `public/screenshots/` and set `src` here.
 */
export interface Screenshot {
  key: 'requirements' | 'architecture' | 'cost';
  src: string | null;
  /** The file this slot expects, shown in the placeholder. */
  expected: string;
}

export const SCREENSHOTS: Screenshot[] = [
  {
    key: 'requirements',
    src: null,
    expected: '/screenshots/screenshot-requirements.png',
  },
  {
    key: 'architecture',
    src: null,
    expected: '/screenshots/screenshot-architecture.png',
  },
  { key: 'cost', src: null, expected: '/screenshots/screenshot-cost.png' },
];
