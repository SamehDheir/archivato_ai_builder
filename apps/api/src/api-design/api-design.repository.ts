import type { ApiDesign } from '@archivato/shared';

/** DI token for the API design store. */
export const API_DESIGN_REPOSITORY = Symbol('API_DESIGN_REPOSITORY');

/** Persistence seam for API designs (Repository pattern). */
export interface ApiDesignRepository {
  upsert(design: ApiDesign): Promise<ApiDesign>;
  findBySessionId(sessionId: string): Promise<ApiDesign | null>;
}
