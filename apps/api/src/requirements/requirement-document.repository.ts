import type { RequirementDocument } from '@archivato/shared';

/** DI token for the requirement document store. */
export const REQUIREMENT_DOCUMENT_REPOSITORY = Symbol(
  'REQUIREMENT_DOCUMENT_REPOSITORY',
);

/** Persistence seam for requirement documents (Repository pattern). */
export interface RequirementDocumentRepository {
  upsert(doc: RequirementDocument): Promise<RequirementDocument>;
  findBySessionId(sessionId: string): Promise<RequirementDocument | null>;
  /** Remove the artifact for a session (used by version restore). No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
