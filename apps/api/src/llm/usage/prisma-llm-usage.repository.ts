import { Injectable } from '@nestjs/common';
import type { AgentRole, LlmUsageStage } from '@archivato/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { LlmUsageRecord } from './llm-usage.entity';
import type {
  CreateLlmUsageInput,
  LlmUsageRepository,
} from './llm-usage.repository';

/** PostgreSQL-backed LLM usage store. */
@Injectable()
export class PrismaLlmUsageRepository implements LlmUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateLlmUsageInput): Promise<void> {
    await this.prisma.llmUsage.create({
      data: {
        provider: input.provider,
        model: input.model,
        agent: input.agent ?? null,
        stage: input.stage,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        cachedPromptTokens: input.cachedPromptTokens,
        cacheWritePromptTokens: input.cacheWritePromptTokens,
        costUsd: input.costUsd,
        ok: input.ok,
        durationMs: input.durationMs,
      },
    });
  }

  async findSince(since: Date): Promise<LlmUsageRecord[]> {
    const rows = await this.prisma.llmUsage.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      agent: (r.agent as AgentRole | null) ?? null,
      stage: r.stage as LlmUsageStage,
      userId: r.userId,
      sessionId: r.sessionId,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      cachedPromptTokens: r.cachedPromptTokens,
      cacheWritePromptTokens: r.cacheWritePromptTokens,
      costUsd: r.costUsd,
      ok: r.ok,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    }));
  }
}
