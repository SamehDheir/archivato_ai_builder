import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ShareLinkRecord } from './share-link.entity';
import type { ShareLinkRepository } from './share-link.repository';

/** PostgreSQL-backed share-link store. */
@Injectable()
export class PrismaShareLinkRepository implements ShareLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIfAbsent(link: ShareLinkRecord): Promise<ShareLinkRecord> {
    try {
      return await this.prisma.shareLink.create({
        data: {
          sessionId: link.sessionId,
          token: link.token,
          viewCount: link.viewCount,
          lastViewedAt: link.lastViewedAt,
          createdAt: link.createdAt,
        },
      });
    } catch (e) {
      // A concurrent mint won the race and already inserted this session's row
      // (`sessionId` is the PK). Idempotency is the contract — "sharing twice
      // never invalidates a link you already sent out" — so the loser hands back
      // the winner's link instead of failing with a constraint error.
      //
      // Deliberately NOT a Prisma `upsert`: an upsert only compiles to a native
      // `INSERT … ON CONFLICT` under conditions an empty `update` may not meet,
      // and would otherwise degrade to the same non-atomic read-then-write this
      // is here to defend against. Let the database's own constraint arbitrate,
      // then re-read the winner — the same posture as `WaitlistService.join`.
      const winner = await this.prisma.shareLink.findUnique({
        where: { sessionId: link.sessionId },
      });
      if (winner) return winner;
      throw e; // a real failure, not a race
    }
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
