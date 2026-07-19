import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';
import { readOpenAiUsage, type OpenAiStyleUsage } from './openai-usage';
import { postLlmJson, readLlmHttpConfig } from './llm-http';

/**
 * Cerebras's production model. Deliberately not `zai-glm-4.7`, which the catalog
 * lists as **preview and scheduled for deprecation** — a default that stops
 * existing on a known date is not a default.
 */
const DEFAULT_MODEL = 'gpt-oss-120b';
const DEFAULT_BASE_URL = 'https://api.cerebras.ai/v1';
const DEFAULT_MAX_TOKENS = 2048;

/**
 * Extra output budget for a model that reasons before it answers — the
 * `REASONING_HEADROOM_TOKENS` rule from the SiliconFlow provider, for the same
 * reason: `maxTokens` means "room for the artifact" everywhere else in this
 * codebase, and thinking that eats the caller's ceiling returns a truncated
 * answer rather than an error.
 *
 * Half of SiliconFlow's 8192, because the binding free-tier limit here is
 * **tokens per minute (30K), not context**: one generous request is fine, but at
 * 5 requests/minute a chunked API-design run is several calls inside that same
 * window, and headroom is counted whether or not the model uses it.
 */
const REASONING_HEADROOM_TOKENS = 4096;

/** Timeout multiplier for a reasoning model — see the SiliconFlow provider. */
const REASONING_TIMEOUT_FACTOR = 2;

/**
 * Models that spend output tokens thinking before they write.
 *
 * `gpt-oss-*` are OpenAI's open-weight reasoning models and are the default here,
 * so this is the normal path rather than the exception.
 */
export function isReasoningModel(model: string): boolean {
  return /gpt-oss|reasoner|thinking|\bglm-4/i.test(model);
}

/**
 * Strip a leaked `<think>…</think>` block.
 *
 * Cerebras returns reasoning separately, so `content` is normally clean — this is
 * the same defence the SiliconFlow provider carries, and it matters for the same
 * reason: a reasoning model **drafts and revises JSON while thinking**, so
 * `parseJsonFromLlm`'s balanced-brace scan would otherwise lock onto a discarded
 * draft instead of the answer. An unterminated block means the response was cut
 * off mid-thought, so it yields '' and the agent falls back rather than parsing
 * half a thought.
 */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/**
 * Cerebras Cloud provider via its OpenAI-compatible chat-completions API.
 *
 * Added for the same reason Groq was: a genuinely free, rate-limited tier (1M
 * tokens/day, no card) that makes the whole pipeline run on real AI with one
 * pasted key. It mirrors `GroqLlmProvider` — global `fetch`, no SDK, Bearer auth,
 * native JSON mode — with three Cerebras specifics that are easy to get wrong:
 *
 *   1. **`max_completion_tokens`, NOT `max_tokens`.** Cerebras dropped the legacy
 *      field. Sending `max_tokens` is the single most likely way to break this
 *      provider while every other OpenAI-shaped one keeps working.
 *   2. **The default model reasons**, so it gets output headroom and a longer
 *      timeout (see `REASONING_HEADROOM_TOKENS`).
 *   3. **The free tier's binding limit is REQUESTS, not tokens** — 5 RPM against
 *      1M tokens/day. A full pipeline run is ~10–12 calls and the API designer
 *      chunks on top of that, so a run spans a couple of minutes of wall clock
 *      and a burst can hit 429. That is survivable here precisely because
 *      generation is already asynchronous (BullMQ / SSE) and `postLlmJson`
 *      honours `Retry-After` — but it is why this is a good *interview* provider
 *      and a slower *design* one.
 *
 * Config: CEREBRAS_API_KEY (required), CEREBRAS_MODEL (default `gpt-oss-120b`),
 * CEREBRAS_BASE_URL (default the public endpoint).
 */
@Injectable()
export class CerebrasLlmProvider implements LlmProvider {
  readonly name = 'cerebras';

  private readonly logger = new Logger(CerebrasLlmProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly http: { timeoutMs: number; maxAttempts: number };
  readonly defaultModel: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('CEREBRAS_API_KEY');
    if (!apiKey) {
      throw new Error('CEREBRAS_API_KEY is required to use the Cerebras provider');
    }
    this.apiKey = apiKey;
    this.defaultModel = config.get<string>('CEREBRAS_MODEL', DEFAULT_MODEL);
    this.baseUrl = config
      .get<string>('CEREBRAS_BASE_URL', DEFAULT_BASE_URL)
      .replace(/\/+$/, '');
    this.http = readLlmHttpConfig(config);
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    return this.send(messages, options, false);
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T> {
    const jsonMessages: LlmMessage[] = [
      ...messages,
      {
        role: 'user',
        content:
          'Respond with a single valid JSON value only. No prose, no markdown fences.',
      },
    ];
    const raw = await this.send(jsonMessages, { temperature: 0, ...options }, true);
    return parseJsonFromLlm<T>(raw);
  }

  private async send(
    messages: LlmMessage[],
    options: LlmCompleteOptions | undefined,
    jsonMode: boolean,
  ): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const reasoning = isReasoningModel(model);
    const budget = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

    const payload: Record<string, unknown> = {
      model,
      // `max_completion_tokens` — Cerebras does not accept `max_tokens`.
      max_completion_tokens: reasoning ? budget + REASONING_HEADROOM_TOKENS : budget,
      temperature: options?.temperature ?? 0.7,
      messages: this.buildMessages(messages, options?.system),
    };
    if (jsonMode) payload.response_format = { type: 'json_object' };

    const data = await postLlmJson<{
      choices?: { message?: { content?: string } }[];
      usage?: OpenAiStyleUsage;
    }>(
      `${this.baseUrl}/chat/completions`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      {
        label: 'Cerebras',
        logger: this.logger,
        ...this.http,
        timeoutMs: reasoning
          ? this.http.timeoutMs * REASONING_TIMEOUT_FACTOR
          : this.http.timeoutMs,
      },
    );

    options?.onUsage?.({ model, usage: readOpenAiUsage(data.usage) });
    return stripReasoning(data.choices?.[0]?.message?.content ?? '');
  }

  /** OpenAI-style messages: a leading system turn plus the conversation. */
  private buildMessages(
    messages: LlmMessage[],
    explicitSystem?: string,
  ): { role: string; content: string }[] {
    const out: { role: string; content: string }[] = [];
    if (explicitSystem) out.push({ role: 'system', content: explicitSystem });
    for (const m of messages) out.push({ role: m.role, content: m.content });
    return out;
  }
}
