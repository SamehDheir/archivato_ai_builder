import { Injectable } from '@nestjs/common';
import type { QaPlan } from '@archivato/shared';
import type { QaPlanRepository } from './qa-plan.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryQaPlanRepository implements QaPlanRepository {
  private readonly plans = new Map<string, QaPlan>();

  async upsert(plan: QaPlan): Promise<QaPlan> {
    this.plans.set(plan.sessionId, plan);
    return plan;
  }

  async findBySessionId(sessionId: string): Promise<QaPlan | null> {
    return this.plans.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.plans.delete(sessionId);
  }
}
