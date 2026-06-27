import { Injectable } from '@nestjs/common';
import type { SystemDesign } from '@archivato/shared';
import type { SystemDesignRepository } from './system-design.repository';

/** Process-local design store; replaced by Prisma in the persistence slice. */
@Injectable()
export class InMemorySystemDesignRepository implements SystemDesignRepository {
  private readonly designs = new Map<string, SystemDesign>();

  async upsert(design: SystemDesign): Promise<SystemDesign> {
    this.designs.set(design.sessionId, design);
    return design;
  }

  async findBySessionId(sessionId: string): Promise<SystemDesign | null> {
    return this.designs.get(sessionId) ?? null;
  }
}
