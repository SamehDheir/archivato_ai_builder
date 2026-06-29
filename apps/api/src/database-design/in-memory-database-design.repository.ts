import { Injectable } from '@nestjs/common';
import type { DatabaseDesign } from '@archivato/shared';
import type { DatabaseDesignRepository } from './database-design.repository';

/** Process-local store; replaced by Prisma in the persistence slice. */
@Injectable()
export class InMemoryDatabaseDesignRepository
  implements DatabaseDesignRepository
{
  private readonly designs = new Map<string, DatabaseDesign>();

  async upsert(design: DatabaseDesign): Promise<DatabaseDesign> {
    this.designs.set(design.sessionId, design);
    return design;
  }

  async findBySessionId(sessionId: string): Promise<DatabaseDesign | null> {
    return this.designs.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.designs.delete(sessionId);
  }
}
