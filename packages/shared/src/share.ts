/**
 * Public share links — a read-only, unauthenticated view of a generated design.
 *
 * The owner (**any plan** — this is the product's organic loop, so it is
 * deliberately not paywalled) mints an unguessable token for a session; anyone
 * holding the link can read the design chain + review, but nothing else: no
 * interview transcript (the user's own words about their business), no owner
 * identity, no session id. The public payload below is the *entire* contract —
 * if a field isn't here, a link holder cannot see it.
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
 *
 * The design chain **through the database design** is required — that is exactly
 * what the Free plan generates, and it is the floor below which a shared page has
 * nothing to show. Everything past it is Pro, so a free owner's link legitimately
 * carries `apiDesign: null` / `review: null` and the page renders what exists.
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
  /** Pro-only stage — null on a design the owner shared from the free tier. */
  apiDesign: ApiDesign | null;
  /** Present only if the owner ran the AI review (Pro). */
  review: ReviewReport | null;
}

/** Path of the public page for a token (relative; the web app owns the origin). */
export function sharePath(token: string): string {
  return `/s/${token}`;
}

/**
 * Every route whose path parameter IS the credential — the web page and the API
 * read that backs it (with or without the `/api` global prefix). The token runs
 * to the first `/`, `?`, or `#`, so a query string survives redaction intact.
 */
const SHARE_TOKEN_ROUTES: RegExp[] = [
  /^(\/s\/)[^/?#]+/, //            web page:  /s/<token>
  /^((?:\/api)?\/shared\/)[^/?#]+/, // API read: /api/shared/<token>
];

/** What a redacted token collapses to (a route, not an instance). */
export const SHARE_TOKEN_PLACEHOLDER = '[token]';

/**
 * Strip the token out of a share path before anything records it.
 *
 * A share token is a **bearer credential** — `GET /shared/:token` is
 * unauthenticated, so whoever holds it reads the design. It must therefore never
 * be written down anywhere with a different access model than the link itself:
 *
 *   - **analytics** — the admin "Top pages" panel renders paths verbatim to anyone
 *     holding `admin:analytics`, a role that grants no project access at all;
 *   - **error logs / Sentry** — a 5xx on the public read would otherwise put a live
 *     credential into the log pipeline and a third-party service.
 *
 * Analytics wants the route anyway; the per-link counter already lives on the
 * share row (`viewCount`).
 *
 * This lives in `shared` because **every sink must agree**: the web beacon redacts
 * before sending, the API redacts again on receipt (that route is public and
 * unauthenticated, so its body is attacker-chosen), and the exception filter
 * redacts before logging. Private copies of the rule would drift — and the leak
 * they'd re-open is silent.
 */
export function redactSharePath(path: string): string {
  for (const route of SHARE_TOKEN_ROUTES) {
    if (route.test(path)) {
      return path.replace(route, `$1${SHARE_TOKEN_PLACEHOLDER}`);
    }
  }
  return path;
}

/**
 * The same, for a referrer — which arrives as an absolute URL
 * (`https://host/s/<token>`), so the token sits in the URL's pathname rather than
 * at the start of the string. Anything unparseable falls back to the path rule.
 */
export function redactShareReferrer(referrer: string): string {
  try {
    const url = new URL(referrer);
    const redacted = redactSharePath(url.pathname);
    if (redacted === url.pathname) return referrer; // not a share URL
    url.pathname = redacted;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return redactSharePath(referrer);
  }
}
