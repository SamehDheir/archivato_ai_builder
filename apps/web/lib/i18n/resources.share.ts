import enStages from '@/locales/en/stages.json';
import enShare from '@/locales/en/share.json';

/**
 * English bundles for the **public share page** (`/s/<token>`) — the artifact
 * views' chrome (`stages`) plus the page's own copy (`share`).
 *
 * Its own tier, not `resources.app.ts`: the share page is a public, unauthed
 * landing surface for people who have never heard of the product, so it must not
 * pay for the dashboard's, billing's, admin's, and support's copy just to render
 * a design. Same rules as the other lazy tiers — only `client.ts` may import
 * this, and only via a dynamic `import()`.
 */
export const shareResources = {
  stages: enStages,
  share: enShare,
} as const;
