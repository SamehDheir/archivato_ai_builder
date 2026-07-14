import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LlmUserSpend } from '@archivato/shared';
import type { LlmUsageRecord } from './llm-usage.entity';
import type {
  CreateLlmUsageInput,
  LlmUsageRepository,
} from './llm-usage.repository';

/** In-memory LLM usage store (unit tests; DB-free). */
@Injectable()
export class InMemoryLlmUsageRepository implements LlmUsageRepository {
  private readonly rows: LlmUsageRecord[] = [];

  async create(input: CreateLlmUsageInput): Promise<void> {
    this.rows.push({ ...input, id: randomUUID(), createdAt: new Date() });
  }

  async findSince(since: Date): Promise<LlmUsageRecord[]> {
    return this.rows
      .filter((r) => r.createdAt >= since)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async spendByUsers(userIds: string[]): Promise<LlmUserSpend[]> {
    const wanted = new Set(userIds);
    const byUser = new Map<string, LlmUserSpend>();

    for (const r of this.rows) {
      if (!r.userId || !wanted.has(r.userId)) continue;
      const entry = byUser.get(r.userId) ?? {
        userId: r.userId,
        calls: 0,
        totalTokens: 0,
        costUsd: 0,
        unpricedCalls: 0,
      };
      const tokens = r.promptTokens + r.completionTokens;
      entry.calls++;
      entry.totalTokens += tokens;
      entry.costUsd += r.costUsd ?? 0;
      // Billed but unpriceable: real tokens, no catalog price for the model.
      if (r.costUsd === null && tokens > 0) entry.unpricedCalls++;
      byUser.set(r.userId, entry);
    }

    return [...byUser.values()];
  }

  /** Test helper: everything recorded so far. */
  all(): LlmUsageRecord[] {
    return [...this.rows];
  }
}
