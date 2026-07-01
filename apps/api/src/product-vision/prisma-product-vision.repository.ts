import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ProductVision } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ProductVisionRepository } from './product-vision.repository';

/** PostgreSQL-backed product vision store (artifact as JSON). */
@Injectable()
export class PrismaProductVisionRepository
  implements ProductVisionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(vision: ProductVision): Promise<ProductVision> {
    const data = vision as unknown as Prisma.InputJsonValue;
    await this.prisma.productVision.upsert({
      where: { sessionId: vision.sessionId },
      create: { sessionId: vision.sessionId, data },
      update: { data },
    });
    return vision;
  }

  async findBySessionId(sessionId: string): Promise<ProductVision | null> {
    const row = await this.prisma.productVision.findUnique({
      where: { sessionId },
    });
    return row ? (row.data as unknown as ProductVision) : null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.productVision.deleteMany({ where: { sessionId } });
  }
}
