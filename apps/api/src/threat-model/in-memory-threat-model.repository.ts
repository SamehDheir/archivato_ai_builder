import { Injectable } from '@nestjs/common';
import type { ThreatModel } from '@archivato/shared';
import { normalizeThreatModel } from '@archivato/shared';
import type { ThreatModelRepository } from './threat-model.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryThreatModelRepository implements ThreatModelRepository {
  private readonly models = new Map<string, ThreatModel>();

  async upsert(model: ThreatModel): Promise<ThreatModel> {
    this.models.set(model.sessionId, model);
    return model;
  }

  async findBySessionId(sessionId: string): Promise<ThreatModel | null> {
    const found = this.models.get(sessionId);
    return found ? normalizeThreatModel(found) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.models.delete(sessionId);
  }
}
