import type { ThreatModel } from '@archivato/shared';

/** DI token for the threat model store. */
export const THREAT_MODEL_REPOSITORY = Symbol('THREAT_MODEL_REPOSITORY');

/** Persistence seam for security threat models (Repository pattern). */
export interface ThreatModelRepository {
  upsert(model: ThreatModel): Promise<ThreatModel>;
  findBySessionId(sessionId: string): Promise<ThreatModel | null>;
  /** Remove the artifact for a session. No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
