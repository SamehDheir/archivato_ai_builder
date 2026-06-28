import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationTokenRecord,
  EmailVerificationTokenRepository,
} from './email-verification-token.repository';

/** In-memory email-verification-token store — used by unit tests. */
@Injectable()
export class InMemoryEmailVerificationTokenRepository
  implements EmailVerificationTokenRepository
{
  private readonly tokens = new Map<string, EmailVerificationTokenRecord>();

  async create(
    input: CreateEmailVerificationTokenInput,
  ): Promise<EmailVerificationTokenRecord> {
    const record: EmailVerificationTokenRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };
    this.tokens.set(record.id, record);
    return { ...record };
  }

  async findByHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenRecord | null> {
    for (const record of this.tokens.values()) {
      if (record.tokenHash === tokenHash) return { ...record };
    }
    return null;
  }

  async consume(id: string): Promise<void> {
    const record = this.tokens.get(id);
    if (record && !record.consumedAt) {
      this.tokens.set(id, { ...record, consumedAt: new Date() });
    }
  }

  async consumeAllForUser(userId: string): Promise<void> {
    for (const [id, record] of this.tokens) {
      if (record.userId === userId && !record.consumedAt) {
        this.tokens.set(id, { ...record, consumedAt: new Date() });
      }
    }
  }
}
