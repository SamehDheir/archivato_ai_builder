import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ApiDesign } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ApiDesignRepository } from './api-design.repository';

/** PostgreSQL-backed API design store (artifact as JSON). */
@Injectable()
export class PrismaApiDesignRepository implements ApiDesignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(design: ApiDesign): Promise<ApiDesign> {
    const data = design as unknown as Prisma.InputJsonValue;
    await this.prisma.apiDesign.upsert({
      where: { sessionId: design.sessionId },
      create: { sessionId: design.sessionId, data },
      update: { data },
    });
    return design;
  }

  async findBySessionId(sessionId: string): Promise<ApiDesign | null> {
    const row = await this.prisma.apiDesign.findUnique({
      where: { sessionId },
    });
    return row ? (row.data as unknown as ApiDesign) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.apiDesign.deleteMany({ where: { sessionId } });
  }
}
