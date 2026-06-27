import type { SystemDesign } from '@archivato/shared';

/** DI token for the system design store. */
export const SYSTEM_DESIGN_REPOSITORY = Symbol('SYSTEM_DESIGN_REPOSITORY');

/** Persistence seam for system designs (Repository pattern). */
export interface SystemDesignRepository {
  upsert(design: SystemDesign): Promise<SystemDesign>;
  findBySessionId(sessionId: string): Promise<SystemDesign | null>;
}
