import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DatabaseDesign } from '@archivato/shared';
import { normalizeDatabaseDesign } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseDesignRepository } from './database-design.repository';

/** PostgreSQL-backed database design store (artifact as JSON). */
@Injectable()
export class PrismaDatabaseDesignRepository
  implements DatabaseDesignRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(design: DatabaseDesign): Promise<DatabaseDesign> {
    const data = design as unknown as Prisma.InputJsonValue;
    await this.prisma.databaseDesign.upsert({
      where: { sessionId: design.sessionId },
      create: { sessionId: design.sessionId, data },
      update: { data },
    });
    return design;
  }

  async findBySessionId(sessionId: string): Promise<DatabaseDesign | null> {
    const row = await this.prisma.databaseDesign.findUnique({
      where: { sessionId },
    });
    return row ? normalizeDatabaseDesign(row.data as unknown as DatabaseDesign) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.databaseDesign.deleteMany({ where: { sessionId } });
  }
}
