import { EMPTY_LLM_USAGE, estimateLlmCostUsd } from '@archivato/shared';
import type {
  LlmCompleteOptions,
  LlmMessage,
  LlmProvider,
  LlmUsageReport,
} from './llm-provider.interface';
import { currentLlmContext } from './usage/llm-usage.context';
import { LlmUsageService } from './usage/llm-usage.service';

/**
 * Decorator that meters every call made through the `LlmProvider` seam.
 *
 * It wraps the real provider rather than living inside each one, so the four
 * providers keep their single responsibility (talk to a model) and there is
 * exactly ONE place that knows how a call becomes a usage row. `LlmModule` wraps
 * whichever provider it resolved, so agents are unchanged — they still depend
 * only on `LlmProvider`.
 *
 * Three details worth keeping:
 *  - Tokens come back through `options.onUsage`, not a "last call" field on the
 *    provider — the pipeline runs stages concurrently and would scramble that.
 *  - A failed call is still recorded (`ok: false`). The important case is a
 *    `completeJson` whose model call SUCCEEDED and whose JSON then failed to
 *    parse: we were billed for those tokens even though the agent fell back.
 *  - When the provider never reported usage (mock, or a request that died before
 *    a response), nothing was billed — the row is $0, not "unknown cost".
 */
export class UsageTrackingLlmProvider implements LlmProvider {
  readonly name: string;
  readonly defaultModel: string;

  constructor(
    private readonly inner: LlmProvider,
    private readonly usage: LlmUsageService,
  ) {
    this.name = inner.name;
    this.defaultModel = inner.defaultModel;
  }

  complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    return this.meter(options, (o) => this.inner.complete(messages, o));
  }

  completeJson<T>(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T> {
    return this.meter(options, (o) => this.inner.completeJson<T>(messages, o));
  }

  private async meter<T>(
    options: LlmCompleteOptions | undefined,
    run: (options: LlmCompleteOptions) => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    let report: LlmUsageReport | undefined;

    // `onUsage` is this decorator's private channel — nothing else sets it, so it
    // is overwritten, not chained.
    const instrumented: LlmCompleteOptions = {
      ...options,
      onUsage: (r) => {
        report = r;
      },
    };

    try {
      const result = await run(instrumented);
      this.record(options, report, true, Date.now() - startedAt);
      return result;
    } catch (err) {
      this.record(options, report, false, Date.now() - startedAt);
      throw err;
    }
  }

  private record(
    options: LlmCompleteOptions | undefined,
    report: LlmUsageReport | undefined,
    ok: boolean,
    durationMs: number,
  ): void {
    const context = currentLlmContext();
    const usage = report?.usage ?? EMPTY_LLM_USAGE;
    const model = report?.model ?? options?.model ?? this.inner.defaultModel;

    // Fire-and-forget: `record` swallows its own failures, and awaiting a metering
    // write would add its latency to every generation.
    void this.usage.record({
      provider: this.inner.name,
      model,
      agent: options?.agent ?? null,
      stage: context?.stage ?? 'other',
      userId: context?.userId ?? null,
      sessionId: context?.sessionId ?? null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedPromptTokens: usage.cachedPromptTokens,
      cacheWritePromptTokens: usage.cacheWritePromptTokens,
      costUsd: report ? estimateLlmCostUsd(model, usage) : 0,
      ok,
      durationMs,
    });
  }
}
