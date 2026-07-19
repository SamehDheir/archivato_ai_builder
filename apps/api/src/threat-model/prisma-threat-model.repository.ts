import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ThreatModel } from '@archivato/shared';
import { normalizeThreatModel } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ThreatModelRepository } from './threat-model.repository';

/** PostgreSQL-backed threat model store (artifact as JSON). */
@Injectable()
export class PrismaThreatModelRepository implements ThreatModelRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(model: ThreatModel): Promise<ThreatModel> {
    const data = model as unknown as Prisma.InputJsonValue;
    await this.prisma.threatModel.upsert({
      where: { sessionId: model.sessionId },
      create: { sessionId: model.sessionId, data },
      update: { data },
    });
    return model;
  }

  async findBySessionId(sessionId: string): Promise<ThreatModel | null> {
    const row = await this.prisma.threatModel.findUnique({
      where: { sessionId },
    });
    return row ? normalizeThreatModel(row.data as unknown as ThreatModel) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.threatModel.deleteMany({ where: { sessionId } });
  }
}
