import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RequirementDocument } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequirementDocumentRepository } from './requirement-document.repository';

/** PostgreSQL-backed requirement document store (artifact as JSON). */
@Injectable()
export class PrismaRequirementDocumentRepository
  implements RequirementDocumentRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(doc: RequirementDocument): Promise<RequirementDocument> {
    const data = doc as unknown as Prisma.InputJsonValue;
    await this.prisma.requirementDocument.upsert({
      where: { sessionId: doc.sessionId },
      create: { sessionId: doc.sessionId, data },
      update: { data },
    });
    return doc;
  }

  async findBySessionId(
    sessionId: string,
  ): Promise<RequirementDocument | null> {
    const row = await this.prisma.requirementDocument.findUnique({
      where: { sessionId },
    });
    return row ? (row.data as unknown as RequirementDocument) : null;
  }
}
