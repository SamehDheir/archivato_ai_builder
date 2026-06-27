import { Injectable } from '@nestjs/common';
import type { RequirementDocument } from '@archivato/shared';
import type { RequirementDocumentRepository } from './requirement-document.repository';

/** Process-local document store; replaced by Prisma in the persistence slice. */
@Injectable()
export class InMemoryRequirementDocumentRepository
  implements RequirementDocumentRepository
{
  private readonly docs = new Map<string, RequirementDocument>();

  async upsert(doc: RequirementDocument): Promise<RequirementDocument> {
    this.docs.set(doc.sessionId, doc);
    return doc;
  }

  async findBySessionId(
    sessionId: string,
  ): Promise<RequirementDocument | null> {
    return this.docs.get(sessionId) ?? null;
  }
}
