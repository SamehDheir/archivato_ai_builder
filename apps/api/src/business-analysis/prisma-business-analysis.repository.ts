import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeBusinessAnalysis, type BusinessAnalysis } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { BusinessAnalysisRepository } from './business-analysis.repository';

/** PostgreSQL-backed business analysis store (artifact as JSON). */
@Injectable()
export class PrismaBusinessAnalysisRepository
  implements BusinessAnalysisRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(analysis: BusinessAnalysis): Promise<BusinessAnalysis> {
    const data = analysis as unknown as Prisma.InputJsonValue;
    await this.prisma.businessAnalysis.upsert({
      where: { sessionId: analysis.sessionId },
      create: { sessionId: analysis.sessionId, data },
      update: { data },
    });
    return analysis;
  }

  /**
   * `row.data as BusinessAnalysis` is a claim, not a check — so the shape and
   * the honesty invariant are both re-applied on the way out, not just on the
   * way in. A row missing an array the type marks required would otherwise take
   * out the view on `.join()`, and one written before the checklist backfill
   * existed would render unverified competitor claims with no sign that nobody
   * checked them. Same convention as `normalizeApiDesign` on read.
   */
  async findBySessionId(sessionId: string): Promise<BusinessAnalysis | null> {
    const row = await this.prisma.businessAnalysis.findUnique({
      where: { sessionId },
    });
    return row
      ? normalizeBusinessAnalysis(row.data as unknown as BusinessAnalysis)
      : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.businessAnalysis.deleteMany({ where: { sessionId } });
  }
}
