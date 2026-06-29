import { Injectable } from '@nestjs/common';
import type { ApiDesign } from '@archivato/shared';
import type { ApiDesignRepository } from './api-design.repository';

/** Process-local store; replaced by Prisma in the persistence slice. */
@Injectable()
export class InMemoryApiDesignRepository implements ApiDesignRepository {
  private readonly designs = new Map<string, ApiDesign>();

  async upsert(design: ApiDesign): Promise<ApiDesign> {
    this.designs.set(design.sessionId, design);
    return design;
  }

  async findBySessionId(sessionId: string): Promise<ApiDesign | null> {
    return this.designs.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.designs.delete(sessionId);
  }
}
