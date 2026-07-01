import type { ProjectRoadmap } from '@archivato/shared';

/** DI token for the project roadmap store. */
export const PROJECT_ROADMAP_REPOSITORY = Symbol('PROJECT_ROADMAP_REPOSITORY');

/** Persistence seam for project roadmaps (Repository pattern). */
export interface ProjectRoadmapRepository {
  upsert(roadmap: ProjectRoadmap): Promise<ProjectRoadmap>;
  findBySessionId(sessionId: string): Promise<ProjectRoadmap | null>;
  /** Remove the artifact for a session (used by version restore). No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
