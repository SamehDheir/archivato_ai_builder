/**
 * Landing-page constants — the numbers and links that change during customer
 * discovery, kept in one file so they can be edited without touching components.
 *
 * Deliberately NOT sourced from `PLANS` in `@archivato/shared`: that is what the
 * billing system actually charges, and the tiers advertised here are still being
 * validated on discovery calls. Keeping them apart means the page can be repriced
 * without touching live billing — but it also means the two can drift, so
 * reconcile them before the new tiers go on sale.
 */

/**
 * A real, public share link used as the "see a real scoping package" proof.
 * Set `NEXT_PUBLIC_DEMO_SHARE_URL` to the token URL of a finished project.
 */
export const DEMO_SHARE_URL =
  process.env.NEXT_PUBLIC_DEMO_SHARE_URL ?? '/s/demo-scoping-package';

/** Monthly price of the paid tier, as displayed. Placeholder until validated. */
export const TEAM_PRICE = '$79';

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
