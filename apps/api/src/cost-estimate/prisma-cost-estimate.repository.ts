import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CostEstimate } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CostEstimateRepository } from './cost-estimate.repository';

/** PostgreSQL-backed cost estimate store (artifact as JSON). */
@Injectable()
export class PrismaCostEstimateRepository implements CostEstimateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(estimate: CostEstimate): Promise<CostEstimate> {
    const data = estimate as unknown as Prisma.InputJsonValue;
    await this.prisma.costEstimate.upsert({
      where: { sessionId: estimate.sessionId },
      create: { sessionId: estimate.sessionId, data },
      update: { data },
    });
    return estimate;
  }

  async findBySessionId(sessionId: string): Promise<CostEstimate | null> {
    const row = await this.prisma.costEstimate.findUnique({
      where: { sessionId },
    });
    return row ? (row.data as unknown as CostEstimate) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.costEstimate.deleteMany({ where: { sessionId } });
  }
}
