import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ProjectRoadmap } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ProjectRoadmapRepository } from './roadmap.repository';

/** PostgreSQL-backed project roadmap store (artifact as JSON). */
@Injectable()
export class PrismaProjectRoadmapRepository
  implements ProjectRoadmapRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(roadmap: ProjectRoadmap): Promise<ProjectRoadmap> {
    const data = roadmap as unknown as Prisma.InputJsonValue;
    await this.prisma.projectRoadmap.upsert({
      where: { sessionId: roadmap.sessionId },
      create: { sessionId: roadmap.sessionId, data },
      update: { data },
    });
    return roadmap;
  }

  async findBySessionId(sessionId: string): Promise<ProjectRoadmap | null> {
    const row = await this.prisma.projectRoadmap.findUnique({
      where: { sessionId },
    });
    return row ? (row.data as unknown as ProjectRoadmap) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.projectRoadmap.deleteMany({ where: { sessionId } });
  }
}
