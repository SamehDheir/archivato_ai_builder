/**
 * Public share links — a read-only, unauthenticated view of a completed design.
 *
 * The owner (Pro) mints an unguessable token for a session; anyone holding the
 * link can read the design chain + review, but nothing else: no interview
 * transcript (the user's own words about their business), no owner identity, no
 * session id. The public payload below is the *entire* contract — if a field
 * isn't here, a link holder cannot see it.
 */

import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';
import type { DatabaseDesign } from './database-design';
import type { ApiDesign } from './api-design';
import type { ReviewReport } from './review';
import type { ProjectIdeaInput } from './pipeline';

/** The owner's view of a session's share link (null when nothing is shared). */
export interface ShareLink {
  /** The unguessable public token; the link is `<web>/s/<token>`. */
  token: string;
  createdAt: string;
  /** How many times the public page has been read. */
  viewCount: number;
}

/**
 * What a link holder receives. Deliberately does NOT carry the session id, the
 * owner, or the interview history — only the artifacts the design chain
 * produced, plus the display name the owner chose.
 */
export interface SharedProject {
  token: string;
  /** The owner's project title, falling back to the idea text. */
  title: string;
  /** When the link was minted. */
  sharedAt: string;
  idea: ProjectIdeaInput;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
  /** Present only if the owner ran the AI review. */
  review: ReviewReport | null;
}

/** Path of the public page for a token (relative; the web app owns the origin). */
export function sharePath(token: string): string {
  return `/s/${token}`;
}

/** The share route with its token still in place. */
const SHARE_PATH = /^\/s\/[^/?#]+/;

/** What a redacted share path collapses to (a route, not an instance). */
export const SHARE_ROUTE = '/s/[token]';

/**
 * Strip the token out of a share path before anything records it.
 *
 * A share token is a **bearer credential** — `GET /shared/:token` is
 * unauthenticated, so whoever holds it reads the design. It must therefore never
 * reach the analytics store, whose access model is completely different: the admin
 * "Top pages" panel renders paths verbatim to anyone holding `admin:analytics`, a
 * role that grants no project access at all. Analytics wants the route anyway; the
 * per-link counter already lives on the share row (`viewCount`).
 *
 * This lives in `shared` because **both ends must agree**: the web beacon redacts
 * before sending, and the API redacts again on receipt (the beacon is public and
 * unauthenticated, so its body is attacker-chosen). Two private copies of the rule
 * could drift — and the leak they'd re-open is silent.
 */
export function redactSharePath(path: string): string {
  return path.replace(SHARE_PATH, SHARE_ROUTE);
}

/**
 * The same, for a referrer — which arrives as an absolute URL
 * (`https://host/s/<token>`), so the token sits in the URL's pathname rather than
 * at the start of the string. Anything unparseable falls back to the path rule.
 */
export function redactShareReferrer(referrer: string): string {
  try {
    const url = new URL(referrer);
    if (!SHARE_PATH.test(url.pathname)) return referrer;
    url.pathname = redactSharePath(url.pathname);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return redactSharePath(referrer);
  }
}
