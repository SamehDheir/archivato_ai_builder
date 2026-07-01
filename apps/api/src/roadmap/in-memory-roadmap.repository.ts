import { Injectable } from '@nestjs/common';
import type { ProjectRoadmap } from '@archivato/shared';
import type { ProjectRoadmapRepository } from './roadmap.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryProjectRoadmapRepository
  implements ProjectRoadmapRepository
{
  private readonly roadmaps = new Map<string, ProjectRoadmap>();

  async upsert(roadmap: ProjectRoadmap): Promise<ProjectRoadmap> {
    this.roadmaps.set(roadmap.sessionId, roadmap);
    return roadmap;
  }

  async findBySessionId(sessionId: string): Promise<ProjectRoadmap | null> {
    return this.roadmaps.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.roadmaps.delete(sessionId);
  }
}
