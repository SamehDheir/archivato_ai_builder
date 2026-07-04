import type { CostEstimate } from '@archivato/shared';

/** DI token for the cost estimate store. */
export const COST_ESTIMATE_REPOSITORY = Symbol('COST_ESTIMATE_REPOSITORY');

/** Persistence seam for cost estimates (Repository pattern). */
export interface CostEstimateRepository {
  upsert(estimate: CostEstimate): Promise<CostEstimate>;
  findBySessionId(sessionId: string): Promise<CostEstimate | null>;
  /** Remove the artifact for a session (used by version restore). No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
