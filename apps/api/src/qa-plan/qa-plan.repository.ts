import type { QaPlan } from '@archivato/shared';

/** DI token for the QA plan store. */
export const QA_PLAN_REPOSITORY = Symbol('QA_PLAN_REPOSITORY');

/** Persistence seam for test/QA plans (Repository pattern). */
export interface QaPlanRepository {
  upsert(plan: QaPlan): Promise<QaPlan>;
  findBySessionId(sessionId: string): Promise<QaPlan | null>;
  /** Remove the artifact for a session. No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
