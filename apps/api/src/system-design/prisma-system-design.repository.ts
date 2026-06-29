import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SystemDesign } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { SystemDesignRepository } from './system-design.repository';

/** PostgreSQL-backed system design store (artifact as JSON). */
@Injectable()
export class PrismaSystemDesignRepository implements SystemDesignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(design: SystemDesign): Promise<SystemDesign> {
    const data = design as unknown as Prisma.InputJsonValue;
    await this.prisma.systemDesign.upsert({
      where: { sessionId: design.sessionId },
      create: { sessionId: design.sessionId, data },
      update: { data },
    });
    return design;
  }

  async findBySessionId(sessionId: string): Promise<SystemDesign | null> {
    const row = await this.prisma.systemDesign.findUnique({
      where: { sessionId },
    });
    return row ? (row.data as unknown as SystemDesign) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.systemDesign.deleteMany({ where: { sessionId } });
  }
}
