import { Injectable } from '@nestjs/common';
import type { CostEstimate } from '@archivato/shared';
import type { CostEstimateRepository } from './cost-estimate.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryCostEstimateRepository implements CostEstimateRepository {
  private readonly estimates = new Map<string, CostEstimate>();

  async upsert(estimate: CostEstimate): Promise<CostEstimate> {
    this.estimates.set(estimate.sessionId, estimate);
    return estimate;
  }

  async findBySessionId(sessionId: string): Promise<CostEstimate | null> {
    return this.estimates.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.estimates.delete(sessionId);
  }
}
