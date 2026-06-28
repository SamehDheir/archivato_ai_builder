import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from './refresh-token.repository';

/** In-memory refresh-token store — used by unit tests. */
@Injectable()
export class InMemoryRefreshTokenRepository
  implements RefreshTokenRepository
{
  private readonly tokens = new Map<string, RefreshTokenRecord>();

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.tokens.set(record.id, record);
    return { ...record };
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const record of this.tokens.values()) {
      if (record.tokenHash === tokenHash) return { ...record };
    }
    return null;
  }

  async revoke(id: string): Promise<void> {
    const record = this.tokens.get(id);
    if (record && !record.revokedAt) {
      this.tokens.set(id, { ...record, revokedAt: new Date() });
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [id, record] of this.tokens) {
      if (record.userId === userId && !record.revokedAt) {
        this.tokens.set(id, { ...record, revokedAt: new Date() });
      }
    }
  }
}
