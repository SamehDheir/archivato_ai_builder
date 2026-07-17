import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeReviewReport, type ReviewReport } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ReviewReportRepository } from './review-report.repository';

/** PostgreSQL-backed review report store (artifact as JSON). */
@Injectable()
export class PrismaReviewReportRepository implements ReviewReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(report: ReviewReport): Promise<ReviewReport> {
    const data = report as unknown as Prisma.InputJsonValue;
    await this.prisma.reviewReport.upsert({
      where: { sessionId: report.sessionId },
      create: { sessionId: report.sessionId, data },
      update: { data },
    });
    return report;
  }

  async findBySessionId(sessionId: string): Promise<ReviewReport | null> {
    const row = await this.prisma.reviewReport.findUnique({
      where: { sessionId },
    });
    if (!row) return null;
    // The cast below is a CLAIM, not a check: a row written before R11 existed
    // carries no finding ids, action types, or statuses, and a write-side
    // normalize can never reach a row already in the table. Normalizing here —
    // the one chokepoint every consumer reads through — is what gives an old
    // report action buttons instead of leaving it inert forever.
    return normalizeReviewReport(row.data as unknown as ReviewReport);
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.reviewReport.deleteMany({ where: { sessionId } });
  }
}
