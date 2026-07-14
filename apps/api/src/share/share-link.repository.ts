import type { ShareLinkRecord } from './share-link.entity';

/** DI token for the share-link store. */
export const SHARE_LINK_REPOSITORY = Symbol('SHARE_LINK_REPOSITORY');

/** Persistence seam for public share links (Repository pattern — project rule). */
export interface ShareLinkRepository {
  /**
   * Insert a link for a session, or return the one that already exists.
   *
   * Atomic on purpose: `create` is idempotent by contract ("sharing twice never
   * invalidates a link you already sent out"), and a plain find-then-insert
   * breaks that exact promise under a double-submit — both callers see no row and
   * the second insert violates the `sessionId` primary key. The winner's row is
   * always what comes back, so both callers get the same token.
   */
  createIfAbsent(link: ShareLinkRecord): Promise<ShareLinkRecord>;
  findBySessionId(sessionId: string): Promise<ShareLinkRecord | null>;
  /** Resolve a public token to its link. The only lookup a link holder can do. */
  findByToken(token: string): Promise<ShareLinkRecord | null>;
  /** Count one public read. Best-effort — never on the critical path of a view. */
  recordView(token: string): Promise<void>;
  /** Revoke: the row is deleted, so the token can never be resurrected. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
