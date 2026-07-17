import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeApiDesign, type ApiDesign } from '@archivato/shared';
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
    // The cast is a claim, not a check: `data` is Json, so nothing guarantees a
    // stored row still satisfies `ApiDesign`. Rows written before the agent
    // normalized its LLM output can be missing required arrays (`statusCodes`),
    // and they reach every consumer — OpenAPI/Postman/scaffold/mock/the view —
    // through this one read. Normalizing here is what heals them, since a
    // write-side rule can never reach a row that is already in the table.
    return row ? normalizeApiDesign(row.data as unknown as ApiDesign) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.apiDesign.deleteMany({ where: { sessionId } });
  }
}
