import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ProjectSnapshot } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateProjectVersionInput,
  ProjectVersionRecord,
  ProjectVersionRepository,
} from './project-version.repository';

/** PostgreSQL-backed version store (snapshot stored as JSON). */
@Injectable()
export class PrismaProjectVersionRepository
  implements ProjectVersionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateProjectVersionInput,
  ): Promise<ProjectVersionRecord> {
    const row = await this.prisma.projectVersion.create({
      data: {
        sessionId: input.sessionId,
        version: input.version,
        label: input.label,
        snapshot: input.snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    return toRecord(row);
  }

  async listBySession(sessionId: string): Promise<ProjectVersionRecord[]> {
    const rows = await this.prisma.projectVersion.findMany({
      where: { sessionId },
      orderBy: { version: 'desc' },
    });
    return rows.map(toRecord);
  }

  async findBySessionAndVersion(
    sessionId: string,
    version: number,
  ): Promise<ProjectVersionRecord | null> {
    const row = await this.prisma.projectVersion.findUnique({
      where: { sessionId_version: { sessionId, version } },
    });
    return row ? toRecord(row) : null;
  }

  async latestBySession(
    sessionId: string,
  ): Promise<ProjectVersionRecord | null> {
    const row = await this.prisma.projectVersion.findFirst({
      where: { sessionId },
      orderBy: { version: 'desc' },
    });
    return row ? toRecord(row) : null;
  }
}

function toRecord(row: {
  id: string;
  sessionId: string;
  version: number;
  label: string;
  snapshot: Prisma.JsonValue;
  createdAt: Date;
}): ProjectVersionRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    version: row.version,
    label: row.label,
    snapshot: row.snapshot as unknown as ProjectSnapshot,
    createdAt: row.createdAt,
  };
}
