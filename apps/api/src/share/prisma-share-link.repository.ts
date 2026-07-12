import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ShareLinkRecord } from './share-link.entity';
import type { ShareLinkRepository } from './share-link.repository';

/** PostgreSQL-backed share-link store. */
@Injectable()
export class PrismaShareLinkRepository implements ShareLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIfAbsent(link: ShareLinkRecord): Promise<ShareLinkRecord> {
    // An empty `update` makes this "insert, or leave the existing row alone" in a
    // single statement — so two concurrent mints can't collide on the sessionId
    // PK, and both callers get back whichever token won.
    return this.prisma.shareLink.upsert({
      where: { sessionId: link.sessionId },
      create: {
        sessionId: link.sessionId,
        token: link.token,
        viewCount: link.viewCount,
        lastViewedAt: link.lastViewedAt,
        createdAt: link.createdAt,
      },
      update: {},
    });
  }

  async findBySessionId(sessionId: string): Promise<ShareLinkRecord | null> {
    return this.prisma.shareLink.findUnique({ where: { sessionId } });
  }

  async findByToken(token: string): Promise<ShareLinkRecord | null> {
    return this.prisma.shareLink.findUnique({ where: { token } });
  }

  async recordView(token: string): Promise<void> {
    // updateMany (not update) so a token revoked between the read and this call
    // is a no-op rather than a thrown P2025 on a best-effort counter.
    await this.prisma.shareLink.updateMany({
      where: { token },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.shareLink.deleteMany({ where: { sessionId } });
  }
}
