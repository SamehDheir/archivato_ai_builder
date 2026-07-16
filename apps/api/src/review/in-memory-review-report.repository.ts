import { Injectable } from '@nestjs/common';
import { normalizeReviewReport, type ReviewReport } from '@archivato/shared';
import type { ReviewReportRepository } from './review-report.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryReviewReportRepository implements ReviewReportRepository {
  private readonly reports = new Map<string, ReviewReport>();

  async upsert(report: ReviewReport): Promise<ReviewReport> {
    this.reports.set(report.sessionId, report);
    return report;
  }

  async findBySessionId(sessionId: string): Promise<ReviewReport | null> {
    const report = this.reports.get(sessionId);
    // Normalize on read, exactly like the Prisma store — a test that seeds an
    // un-normalized report must see what production would see.
    return report ? normalizeReviewReport(report) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.reports.delete(sessionId);
  }
}
