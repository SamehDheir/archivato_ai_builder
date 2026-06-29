import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreatePasswordResetTokenInput,
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from './password-reset-token.repository';

/** In-memory password-reset-token store — used by unit tests. */
@Injectable()
export class InMemoryPasswordResetTokenRepository
  implements PasswordResetTokenRepository
{
  private readonly tokens = new Map<string, PasswordResetTokenRecord>();

  async create(
    input: CreatePasswordResetTokenInput,
  ): Promise<PasswordResetTokenRecord> {
    const record: PasswordResetTokenRecord = {
      id: randomUUID(),
      userId: input.userId,
      codeHash: input.codeHash,
      attempts: 0,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };
    this.tokens.set(record.id, record);
    return { ...record };
  }

  async findActiveByUserId(
    userId: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const active = [...this.tokens.values()]
      .filter((t) => t.userId === userId && !t.consumedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return active[0] ? { ...active[0] } : null;
  }

  async consume(id: string): Promise<void> {
    const record = this.tokens.get(id);
    if (record && !record.consumedAt) {
      this.tokens.set(id, { ...record, consumedAt: new Date() });
    }
  }

  async incrementAttempts(id: string): Promise<number> {
    const record = this.tokens.get(id);
    if (!record) return 0;
    const attempts = record.attempts + 1;
    this.tokens.set(id, { ...record, attempts });
    return attempts;
  }

  async consumeAllForUser(userId: string): Promise<void> {
    for (const [id, record] of this.tokens) {
      if (record.userId === userId && !record.consumedAt) {
        this.tokens.set(id, { ...record, consumedAt: new Date() });
      }
    }
  }
}
