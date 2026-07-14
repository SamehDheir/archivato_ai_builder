import { Injectable } from '@nestjs/common';
import type { AgentRole, LlmUsageStage, LlmUserSpend } from '@archivato/shared';
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

  /**
   * Lifetime spend per user, aggregated by Postgres (two grouped reads, no row
   * transfer). The second read counts calls we were BILLED for but cannot price
   * (unlisted model ⇒ null cost, yet real tokens) — the caller needs those to
   * mark a cost as a floor rather than print a confident `$0.00`.
   */
  async spendByUsers(userIds: string[]): Promise<LlmUserSpend[]> {
    if (userIds.length === 0) return [];
    const where = { userId: { in: userIds } };

    const [totals, unpriced] = await Promise.all([
      this.prisma.llmUsage.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        _sum: { costUsd: true, promptTokens: true, completionTokens: true },
      }),
      this.prisma.llmUsage.groupBy({
        by: ['userId'],
        where: {
          ...where,
          costUsd: null,
          // "Billed" = the model actually consumed tokens (excludes mock calls
          // and calls that died before a response — those really did cost $0).
          OR: [{ promptTokens: { gt: 0 } }, { completionTokens: { gt: 0 } }],
        },
        _count: { _all: true },
      }),
    ]);

    const unpricedByUser = new Map(
      unpriced.map((u) => [u.userId, u._count._all] as const),
    );

    return totals
      .filter((t): t is typeof t & { userId: string } => t.userId !== null)
      .map((t) => ({
        userId: t.userId,
        calls: t._count._all,
        totalTokens:
          (t._sum.promptTokens ?? 0) + (t._sum.completionTokens ?? 0),
        costUsd: t._sum.costUsd ?? 0,
        unpricedCalls: unpricedByUser.get(t.userId) ?? 0,
      }));
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
