import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ShareLink, SharedProject } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { ExportService } from '../export/export.service';
import {
  SHARE_LINK_REPOSITORY,
  type ShareLinkRepository,
} from './share-link.repository';

/** 32 bytes of CSPRNG entropy — the token is the only credential on the link. */
const TOKEN_BYTES = 32;

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly links: ShareLinkRepository,
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    private readonly exports: ExportService,
  ) {}

  /** The owner's current link for a session, or null when nothing is shared. */
  async get(sessionId: string): Promise<ShareLink | null> {
    const link = await this.links.findBySessionId(sessionId);
    return link ? toShareLink(link) : null;
  }

  /**
   * Mint a public link for a completed design. Idempotent: an existing link is
   * returned as-is, so "Share" never silently invalidates a link the owner has
   * already sent out (rotating is `revoke` + `create`).
   *
   * `ExportService.bundle` supplies the gate for free — it 409s unless the
   * pipeline is complete through the API design, so a half-built project can
   * never be shared.
   */
  async create(sessionId: string): Promise<ShareLink> {
    await this.exports.bundle(sessionId);

    // `createIfAbsent` is what actually guarantees idempotency (a double-submit
    // would otherwise collide on the sessionId PK); this read just avoids burning
    // a token on the common "already shared" path.
    const existing = await this.links.findBySessionId(sessionId);
    if (existing) return toShareLink(existing);

    const created = await this.links.createIfAbsent({
      sessionId,
      token: randomBytes(TOKEN_BYTES).toString('base64url'),
      viewCount: 0,
      lastViewedAt: null,
      createdAt: new Date(),
    });
    return toShareLink(created);
  }

  /** Revoke the link. The row is deleted, so the token dies permanently. */
  async revoke(sessionId: string): Promise<void> {
    await this.links.deleteBySessionId(sessionId);
  }

  /**
   * Resolve a public token to the read-only project. **This is the only path an
   * unauthenticated caller has into a session**, so it returns strictly the
   * `SharedProject` contract — no session id, no owner, no interview transcript.
   */
  async view(token: string): Promise<SharedProject> {
    const link = await this.links.findByToken(token);
    if (!link) throw new NotFoundException('This share link is not available.');

    // Independent reads, so don't pay for them serially — this is the one route
    // built to absorb a link going viral.
    const [session, bundle] = await Promise.all([
      this.sessions.findById(link.sessionId),
      // The design can regress out from under a live link (e.g. a version restore
      // drops the API design). A link holder gets "gone", not the 409 the owner
      // would see — they can't act on it and shouldn't learn why.
      this.exports.bundle(link.sessionId).catch((e: unknown) => {
        if (e instanceof ConflictException || e instanceof NotFoundException) {
          return null;
        }
        throw e;
      }),
    ]);

    if (!session || !bundle) {
      throw new NotFoundException('This share link is not available.');
    }

    // Best-effort: a failed counter must never break the page.
    this.links.recordView(token).catch((e: unknown) => {
      this.logger.warn(`Failed to record a share view: ${String(e)}`);
    });

    // Every artifact is stamped with the internal session id — the same id that
    // addresses the owner-scoped routes. It grants a stranger nothing (those
    // routes 404 a non-owner), but a public page has no business handing out an
    // internal identifier, so the token stands in for it.
    return {
      token,
      title: session.title ?? session.input.idea,
      sharedAt: link.createdAt.toISOString(),
      idea: session.input,
      requirements: { ...bundle.requirements, sessionId: token },
      systemDesign: { ...bundle.systemDesign, sessionId: token },
      databaseDesign: { ...bundle.databaseDesign, sessionId: token },
      apiDesign: { ...bundle.apiDesign, sessionId: token },
      review: bundle.review ? { ...bundle.review, sessionId: token } : null,
    };
  }
}

function toShareLink(link: {
  token: string;
  createdAt: Date;
  viewCount: number;
}): ShareLink {
  return {
    token: link.token,
    createdAt: link.createdAt.toISOString(),
    viewCount: link.viewCount,
  };
}
