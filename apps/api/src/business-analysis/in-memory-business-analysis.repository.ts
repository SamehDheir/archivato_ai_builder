import { Injectable } from '@nestjs/common';
import { normalizeBusinessAnalysis, type BusinessAnalysis } from '@archivato/shared';
import type { BusinessAnalysisRepository } from './business-analysis.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryBusinessAnalysisRepository
  implements BusinessAnalysisRepository
{
  private readonly analyses = new Map<string, BusinessAnalysis>();

  async upsert(analysis: BusinessAnalysis): Promise<BusinessAnalysis> {
    this.analyses.set(analysis.sessionId, analysis);
    return analysis;
  }

  /**
   * Normalizes on read exactly like the Prisma store. The unit tests run against
   * this impl, so skipping it here would let a test pass on a shape production
   * repairs — or worse, hide a crash production would still hit.
   */
  async findBySessionId(sessionId: string): Promise<BusinessAnalysis | null> {
    const analysis = this.analyses.get(sessionId);
    return analysis ? normalizeBusinessAnalysis(analysis) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.analyses.delete(sessionId);
  }
}
