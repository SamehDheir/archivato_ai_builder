import type { ProjectSnapshot } from '@archivato/shared';

/** DI token for the project version-history store. */
export const PROJECT_VERSION_REPOSITORY = Symbol('PROJECT_VERSION_REPOSITORY');

/** A stored version row (snapshot of every artifact at a point in time). */
export interface ProjectVersionRecord {
  id: string;
  sessionId: string;
  version: number;
  label: string;
  snapshot: ProjectSnapshot;
  createdAt: Date;
}

export interface CreateProjectVersionInput {
  sessionId: string;
  version: number;
  label: string;
  snapshot: ProjectSnapshot;
}

/** Persistence seam for project versions (Repository pattern). */
export interface ProjectVersionRepository {
  create(input: CreateProjectVersionInput): Promise<ProjectVersionRecord>;
  /** All versions for a session, newest first. */
  listBySession(sessionId: string): Promise<ProjectVersionRecord[]>;
  findBySessionAndVersion(
    sessionId: string,
    version: number,
  ): Promise<ProjectVersionRecord | null>;
  /** The highest-numbered version for a session, or null if none yet. */
  latestBySession(sessionId: string): Promise<ProjectVersionRecord | null>;
}
