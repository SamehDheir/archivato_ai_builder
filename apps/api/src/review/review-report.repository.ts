import type { ReviewReport } from '@archivato/shared';

/** DI token for the review report store. */
export const REVIEW_REPORT_REPOSITORY = Symbol('REVIEW_REPORT_REPOSITORY');

/** Persistence seam for review reports (Repository pattern). */
export interface ReviewReportRepository {
  upsert(report: ReviewReport): Promise<ReviewReport>;
  findBySessionId(sessionId: string): Promise<ReviewReport | null>;
}
