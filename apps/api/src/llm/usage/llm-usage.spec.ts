import { AgentRole } from '@archivato/shared';
import type {
  LlmCompleteOptions,
  LlmMessage,
  LlmProvider,
} from '../llm-provider.interface';
import { LlmJsonParseError } from '../llm-provider.interface';
import { MockLlmProvider } from '../mock-llm.provider';
import { UsageTrackingLlmProvider } from '../usage-tracking-llm.provider';
import { InMemoryLlmUsageRepository } from './in-memory-llm-usage.repository';
import { LlmUsageService } from './llm-usage.service';
import { runWithLlmContext } from './llm-usage.context';

/** A provider that reports usage the way a real one does, via `options.onUsage`. */
class FakeReportingProvider implements LlmProvider {
  readonly name = 'fake';
  readonly defaultModel = 'claude-sonnet-4-6';

  constructor(private readonly failAfterUsage = false) {}

  async complete(
    _messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    options?.onUsage?.({
      model: options?.model ?? this.defaultModel,
      usage: {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        cachedPromptTokens: 0,
        cacheWritePromptTokens: 0,
      },
    });
    if (this.failAfterUsage) {
      // The model answered (and billed us) but the answer wasn't valid JSON.
      throw new LlmJsonParseError('not json', 'oops');
    }
    return 'ok';
  }

  completeJson<T>(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T> {
    return this.complete(messages, options) as Promise<T>;
  }
}

describe('UsageTrackingLlmProvider', () => {
  let repo: InMemoryLlmUsageRepository;
  let service: LlmUsageService;

  beforeEach(() => {
    repo = new InMemoryLlmUsageRepository();
    service = new LlmUsageService(repo);
  });

  it('is transparent — it returns whatever the inner provider returned', async () => {
    const inner = new MockLlmProvider();
    inner.enqueueJson({ hello: 'world' });
    const provider = new UsageTrackingLlmProvider(inner, service);

    await expect(
      provider.completeJson<{ hello: string }>([{ role: 'user', content: 'hi' }]),
    ).resolves.toEqual({ hello: 'world' });
  });

  it('records tokens + deterministic cost, attributed to the caller context', async () => {
    const provider = new UsageTrackingLlmProvider(
      new FakeReportingProvider(),
      service,
    );

    await runWithLlmContext(
      { userId: 'u1', sessionId: 's1', stage: 'system-design' },
      () =>
        provider.complete([{ role: 'user', content: 'design it' }], {
          agent: AgentRole.SystemArchitect,
        }),
    );

    const [row] = repo.all();
    expect(row).toMatchObject({
      provider: 'fake',
      model: 'claude-sonnet-4-6',
      agent: AgentRole.SystemArchitect,
      stage: 'system-design',
      userId: 'u1',
      sessionId: 's1',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      costUsd: 18, // $3/1M in + $15/1M out
      ok: true,
    });
  });

  it('still bills a call whose model answered but whose JSON failed to parse', async () => {
    const provider = new UsageTrackingLlmProvider(
      new FakeReportingProvider(true),
      service,
    );

    await expect(
      provider.completeJson([{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(LlmJsonParseError);

    const [row] = repo.all();
    expect(row.ok).toBe(false);
    // We paid for those tokens even though the agent fell back.
    expect(row.costUsd).toBe(18);
  });

  it('records the mock provider as a zero-token, zero-cost call', async () => {
    const provider = new UsageTrackingLlmProvider(new MockLlmProvider(), service);
    await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(repo.all()[0]).toMatchObject({
      provider: 'mock',
      model: 'mock',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      ok: true,
    });
  });

  it('falls back to stage `other` with no user when there is no context', async () => {
    const provider = new UsageTrackingLlmProvider(new MockLlmProvider(), service);
    await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(repo.all()[0]).toMatchObject({ stage: 'other', userId: null });
  });

  it('never lets a metering failure break generation', async () => {
    const brokenRepo = {
      create: jest.fn().mockRejectedValue(new Error('db down')),
      findSince: jest.fn(),
    };
    const provider = new UsageTrackingLlmProvider(
      new MockLlmProvider(),
      new LlmUsageService(brokenRepo),
    );

    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).resolves.toBeDefined();
    expect(brokenRepo.create).toHaveBeenCalled();
  });
});

describe('LlmUsageService.report', () => {
  it('aggregates spend by stage/model/agent/user and flags unpriced calls', async () => {
    const repo = new InMemoryLlmUsageRepository();
    const service = new LlmUsageService(repo);

    await repo.create({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      agent: AgentRole.SystemArchitect,
      stage: 'system-design',
      userId: 'u1',
      sessionId: 's1',
      promptTokens: 1000,
      completionTokens: 500,
      cachedPromptTokens: 0,
      cacheWritePromptTokens: 0,
      costUsd: 0.5,
      ok: true,
      durationMs: 120,
    });
    await repo.create({
      provider: 'groq',
      model: 'some-unlisted-model',
      agent: AgentRole.Reviewer,
      stage: 'review',
      userId: 'u1',
      sessionId: 's1',
      promptTokens: 200,
      completionTokens: 100,
      cachedPromptTokens: 0,
      cacheWritePromptTokens: 0,
      costUsd: null,
      ok: false,
      durationMs: 90,
    });

    const report = await service.report();

    expect(report.last30d).toMatchObject({
      calls: 2,
      failedCalls: 1,
      totalTokens: 1800,
      costUsd: 0.5,
      // The unlisted model's tokens are counted; its cost is not — so `costUsd`
      // is a floor, and the UI has to say so.
      unpricedCalls: 1,
    });
    expect(report.byStage.map((r) => r.key)).toEqual(['system-design', 'review']);
    expect(report.topUsers[0]).toMatchObject({ key: 'u1', calls: 2, costUsd: 0.5 });
    expect(report.costSeries).toHaveLength(30);
    expect(report.costSeries.at(-1)?.value).toBe(0.5);
  });
});
