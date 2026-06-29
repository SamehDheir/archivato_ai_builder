import { Injectable } from '@nestjs/common';
import type { ReviewReport } from '@archivato/shared';
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
    return this.reports.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.reports.delete(sessionId);
  }
}
