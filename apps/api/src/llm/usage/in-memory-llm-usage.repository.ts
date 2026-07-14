import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

  /** Test helper: everything recorded so far. */
  all(): LlmUsageRecord[] {
    return [...this.rows];
  }
}
