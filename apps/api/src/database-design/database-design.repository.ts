import type { DatabaseDesign } from '@archivato/shared';

/** DI token for the database design store. */
export const DATABASE_DESIGN_REPOSITORY = Symbol('DATABASE_DESIGN_REPOSITORY');

/** Persistence seam for database designs (Repository pattern). */
export interface DatabaseDesignRepository {
  upsert(design: DatabaseDesign): Promise<DatabaseDesign>;
  findBySessionId(sessionId: string): Promise<DatabaseDesign | null>;
}
