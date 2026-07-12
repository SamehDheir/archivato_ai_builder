import { Injectable } from '@nestjs/common';
import type { ShareLinkRecord } from './share-link.entity';
import type { ShareLinkRepository } from './share-link.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryShareLinkRepository implements ShareLinkRepository {
  /** Keyed by sessionId (one link per session). */
  private readonly links = new Map<string, ShareLinkRecord>();

  async createIfAbsent(link: ShareLinkRecord): Promise<ShareLinkRecord> {
    const existing = this.links.get(link.sessionId);
    if (existing) return existing;
    this.links.set(link.sessionId, link);
    return link;
  }

  async findBySessionId(sessionId: string): Promise<ShareLinkRecord | null> {
    return this.links.get(sessionId) ?? null;
  }

  async findByToken(token: string): Promise<ShareLinkRecord | null> {
    for (const link of this.links.values()) {
      if (link.token === token) return link;
    }
    return null;
  }

  async recordView(token: string): Promise<void> {
    const link = await this.findByToken(token);
    if (!link) return;
    link.viewCount += 1;
    link.lastViewedAt = new Date();
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.links.delete(sessionId);
  }
}
