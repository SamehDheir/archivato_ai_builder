import type { ProductVision } from '@archivato/shared';

/** DI token for the product vision store. */
export const PRODUCT_VISION_REPOSITORY = Symbol('PRODUCT_VISION_REPOSITORY');

/** Persistence seam for product visions (Repository pattern). */
export interface ProductVisionRepository {
  upsert(vision: ProductVision): Promise<ProductVision>;
  findBySessionId(sessionId: string): Promise<ProductVision | null>;
  /** Remove the artifact for a session (used by version restore). No-op if absent. */
  deleteBySessionId(sessionId: string): Promise<void>;
}
