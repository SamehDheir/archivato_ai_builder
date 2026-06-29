import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateProjectVersionInput,
  ProjectVersionRecord,
  ProjectVersionRepository,
} from './project-version.repository';

/** Process-local version store used by unit tests. */
@Injectable()
export class InMemoryProjectVersionRepository
  implements ProjectVersionRepository
{
  private readonly rows: ProjectVersionRecord[] = [];

  async create(
    input: CreateProjectVersionInput,
  ): Promise<ProjectVersionRecord> {
    const row: ProjectVersionRecord = {
      id: randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.rows.push(row);
    return row;
  }

  async listBySession(sessionId: string): Promise<ProjectVersionRecord[]> {
    return this.rows
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => b.version - a.version);
  }

  async findBySessionAndVersion(
    sessionId: string,
    version: number,
  ): Promise<ProjectVersionRecord | null> {
    return (
      this.rows.find(
        (r) => r.sessionId === sessionId && r.version === version,
      ) ?? null
    );
  }

  async latestBySession(
    sessionId: string,
  ): Promise<ProjectVersionRecord | null> {
    const [latest] = await this.listBySession(sessionId);
    return latest ?? null;
  }
}
