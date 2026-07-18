import { redactReviewForShare } from '@archivato/shared';
import type { SharedProject } from '@archivato/shared';
import {
  EXAMPLE_API_DESIGN,
  EXAMPLE_COST_ESTIMATE,
  EXAMPLE_DATABASE_DESIGN,
  EXAMPLE_QA_PLAN,
  EXAMPLE_REQUIREMENTS,
  EXAMPLE_REVIEW,
  EXAMPLE_ROADMAP,
  EXAMPLE_SYSTEM_DESIGN,
  EXAMPLE_THREAT_MODEL,
  EXAMPLE_VISION,
} from '@/lib/example-project';

/**
 * The demo package's public route. Also its SEO landing path.
 *
 * Defined in `lib/site.ts` and re-exported here so this module stays the one
 * import for everything demo-related, while a caller that needs only the path
 * (the landing page) can take it from `site.ts` without pulling in the fixture
 * built below.
 */
export { DEMO_PATH } from '@/lib/site';

/** The name a visitor sees. Matches `dashboard.example.name`'s subject. */
export const DEMO_TITLE = 'HomeHelper — on-demand home-services booking';

/**
 * The example project, shaped as a **public share payload**.
 *
 * The single most persuasive thing this product can show a prospective customer
 * is not a feature list — it's the artifact their own client would receive. This
 * page is that artifact, rendered by the very same `SharedProjectView` a real
 * share link renders, from the same fixture the in-app example tour uses. So the
 * demo cannot drift from the product: if the share page changes, this changes
 * with it, and if the fixture is wrong, both are wrong together.
 *
 * Two deliberate choices:
 *
 * 1. **`watermark: false`.** The watermark is what a FREE owner's link carries
 *    (see `shouldWatermarkShare`), and it advertises us on someone else's
 *    proposal. Printing it here would be advertising to ourselves on our own
 *    page, and would show a prospect the downgraded output rather than the one
 *    they'd be buying. This is not a plan check — no owner and no plan exist
 *    here; it's a marketing page holding a fixture.
 *
 * 2. **A non-secret `token`.** `SharedProject.token` normally IS the link's
 *    credential, and `SharedProjectView` overwrites every artifact's `sessionId`
 *    with it precisely so no internal id reaches a public page. Here it
 *    addresses nothing — there is no share row, no session, and no API that will
 *    answer for it — so a readable slug is honest and can't leak anything.
 *
 * **The owner-only redaction is applied here too**, using the same
 * `redactReviewForShare` + `budgetWarning: null` that `ShareService.view` runs.
 * Not for security — there is nothing secret in a fixture — but for HONESTY: a
 * demo that shows the client-readiness findings, the consistency findings and
 * the budget warning would be showing a prospect something no real client ever
 * receives. The whole value of this page is that it is exactly the artifact,
 * so it has to be exactly the artifact. If the redaction rules change, this
 * follows automatically.
 */
export const DEMO_SCOPING_PACKAGE: SharedProject = {
  token: 'demo-scoping-package',
  title: DEMO_TITLE,
  // Fixed, not `new Date()`: the page is statically prerendered, so a live clock
  // would bake the build date in and then quietly age. A stated date on a demo
  // is a prop, and it must not read as "issued today" six months from now.
  sharedAt: '2026-01-01T00:00:00.000Z',
  idea: {
    idea: 'An on-demand marketplace where customers book vetted home-services professionals — cleaning, handyman, moving — pay securely online, and rate the work.',
    industry: 'home services',
    scale: 'startup',
  },
  vision: EXAMPLE_VISION,
  requirements: EXAMPLE_REQUIREMENTS,
  // Mirrors ShareService.view: the budget warning is a deal risk for the owner,
  // never for the client's eyes.
  costEstimate: { ...EXAMPLE_COST_ESTIMATE, budgetWarning: null },
  roadmap: EXAMPLE_ROADMAP,
  systemDesign: EXAMPLE_SYSTEM_DESIGN,
  databaseDesign: EXAMPLE_DATABASE_DESIGN,
  apiDesign: EXAMPLE_API_DESIGN,
  review: redactReviewForShare(EXAMPLE_REVIEW),
  threatModel: EXAMPLE_THREAT_MODEL,
  qaPlan: EXAMPLE_QA_PLAN,
  watermark: false,
};
