/**
 * The persisted state of one public share link. At most one row per session:
 * revoking deletes it, so re-sharing mints a new token and the old link is dead
 * for good (there is no "re-enable").
 */
export interface ShareLinkRecord {
  sessionId: string;
  /** Unguessable public credential (32 random bytes, base64url). */
  token: string;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
}
