import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { QaPlan } from '@archivato/shared';
import { normalizeQaPlan } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { QaPlanRepository } from './qa-plan.repository';

/** PostgreSQL-backed QA plan store (artifact as JSON). */
@Injectable()
export class PrismaQaPlanRepository implements QaPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(plan: QaPlan): Promise<QaPlan> {
    const data = plan as unknown as Prisma.InputJsonValue;
    await this.prisma.qaPlan.upsert({
      where: { sessionId: plan.sessionId },
      create: { sessionId: plan.sessionId, data },
      update: { data },
    });
    return plan;
  }

  async findBySessionId(sessionId: string): Promise<QaPlan | null> {
    const row = await this.prisma.qaPlan.findUnique({ where: { sessionId } });
    return row ? normalizeQaPlan(row.data as unknown as QaPlan) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.qaPlan.deleteMany({ where: { sessionId } });
  }
}
