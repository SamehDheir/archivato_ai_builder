import type { BusinessAnalysis } from '@archivato/shared';

/** DI token for the business analysis store. */
export const BUSINESS_ANALYSIS_REPOSITORY = Symbol('BUSINESS_ANALYSIS_REPOSITORY');

/** Persistence seam for business analyses (Repository pattern). */
export interface BusinessAnalysisRepository {
  upsert(analysis: BusinessAnalysis): Promise<BusinessAnalysis>;
  findBySessionId(sessionId: string): Promise<BusinessAnalysis | null>;
  /** Remove the artifact for a session (used by version restore). No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
