import { Injectable } from '@nestjs/common';
import type { ProductVision } from '@archivato/shared';
import type { ProductVisionRepository } from './product-vision.repository';

/** Process-local store used by unit tests. */
@Injectable()
export class InMemoryProductVisionRepository
  implements ProductVisionRepository
{
  private readonly visions = new Map<string, ProductVision>();

  async upsert(vision: ProductVision): Promise<ProductVision> {
    this.visions.set(vision.sessionId, vision);
    return vision;
  }

  async findBySessionId(sessionId: string): Promise<ProductVision | null> {
    return this.visions.get(sessionId) ?? null;
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    this.visions.delete(sessionId);
  }
}
