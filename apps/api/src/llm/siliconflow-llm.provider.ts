import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';
import { readOpenAiUsage, type OpenAiStyleUsage } from './openai-usage';

const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-R1';
const DEFAULT_BASE_URL = 'https://api.siliconflow.com/v1';
const DEFAULT_MAX_TOKENS = 2048;

/**
 * Extra output budget granted to a reasoning model on top of what the caller
 * asked for.
 *
 * Everywhere else in this codebase `maxTokens` means "room for the artifact" —
 * `CHUNK_MAX_TOKENS` in the API designer is sized to one chunk of endpoints, not
 * to a chain of thought. A reasoning model spends output tokens thinking BEFORE
 * it writes that artifact, so passing the caller's budget through untouched
 * would let the thinking eat the whole ceiling and return a truncated (or empty)
 * answer — the exact silent-short-parse failure the chunking exists to avoid.
 * So the thinking gets its own allowance and the caller's number keeps meaning
 * what it means for every other provider.
 */
const REASONING_HEADROOM_TOKENS = 8192;

/**
 * DeepSeek documents that temperature 0 sends R1 into endless repetition, and
 * `completeJson` asks every provider for 0. Reasoning models get a floor instead.
 */
const REASONING_MIN_TEMPERATURE = 0.6;

/** Models that emit a chain of thought before their answer. */
export function isReasoningModel(model: string): boolean {
  return /deepseek-r1|qwq|reasoner|thinking/i.test(model);
}

/**
 * Whether the model accepts `response_format: json_object`.
 *
 * SiliconFlow honours it across most of its catalog but **not** on DeepSeek's
 * R1 *or* V3 series, which reject the request outright — so this can't just be
 * `!isReasoningModel` (V3 is not a reasoning model and still 400s). The whole
 * `deepseek-ai/*` family is excluded rather than enumerated, because the two
 * failure modes are wildly asymmetric: being too broad costs nothing (the model
 * falls back to the prompt nudge + `parseJsonFromLlm`, exactly what the Claude
 * provider has always done), while being too narrow breaks every call.
 */
export function supportsJsonMode(model: string): boolean {
  return !/deepseek/i.test(model) && !isReasoningModel(model);
}

/**
 * Strip `<think>…</think>` chain-of-thought from a completion.
 *
 * SiliconFlow normally returns reasoning in a separate `reasoning_content`
 * field, leaving `content` clean — but not every model/route does, and a leaked
 * think block is worse here than it looks: the model drafts and revises JSON
 * while reasoning, so `parseJsonFromLlm`'s balanced-brace scan would lock onto
 * the FIRST object it sees, which is a discarded draft rather than the answer.
 *
 * An unterminated block means the response was cut off mid-thought — there is no
 * answer in there, so this yields '' and the caller throws/falls back rather than
 * parsing half a thought.
 */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/**
 * SiliconFlow provider via its OpenAI-compatible chat-completions API, aimed at
 * the hosted DeepSeek models (default `deepseek-ai/DeepSeek-R1`). Mirrors
 * `GroqLlmProvider` — global `fetch`, no SDK — with the two things a reasoning
 * model changes:
 *
 *   - **No native JSON mode.** SiliconFlow supports `response_format:
 *     json_object` on most of its catalog but NOT on the DeepSeek R1/V3 series,
 *     which rejects the request. So JSON mode is sent only for models that take
 *     it; R1 relies on the prompt nudge plus `parseJsonFromLlm`, which is what
 *     the Claude provider has always done.
 *   - **Thinking costs output tokens** — see `REASONING_HEADROOM_TOKENS`.
 *
 * Config: SILICONFLOW_API_KEY (required), SILICONFLOW_MODEL (default
 * deepseek-ai/DeepSeek-R1), SILICONFLOW_BASE_URL (default the public endpoint).
 */
@Injectable()
export class SiliconFlowLlmProvider implements LlmProvider {
  readonly name = 'siliconflow';

  private readonly logger = new Logger(SiliconFlowLlmProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  readonly defaultModel: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('SILICONFLOW_API_KEY');
    if (!apiKey) {
      throw new Error(
        'SILICONFLOW_API_KEY is required to use the SiliconFlow provider',
      );
    }
    this.apiKey = apiKey;
    this.defaultModel = config.get<string>('SILICONFLOW_MODEL', DEFAULT_MODEL);
    // Tolerate a trailing slash on a self-configured endpoint.
    this.baseUrl = config
      .get<string>('SILICONFLOW_BASE_URL', DEFAULT_BASE_URL)
      .trim()
      .replace(/\/+$/, '');
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
    // Default to deterministic JSON, but let callers override the temperature.
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
    const requested = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

    const payload: Record<string, unknown> = {
      model,
      max_tokens: reasoning ? requested + REASONING_HEADROOM_TOKENS : requested,
      temperature: this.resolveTemperature(options?.temperature, reasoning),
      messages: this.buildMessages(messages, options?.system),
    };
    if (jsonMode && supportsJsonMode(model)) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      this.logger.error(`SiliconFlow request failed (${res.status}): ${detail}`);
      throw new Error(`SiliconFlow request failed with status ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: OpenAiStyleUsage;
      model?: string;
    };
    // Price off the model the API says it ran, not the id we asked for.
    options?.onUsage?.({
      model: data.model || model,
      usage: readOpenAiUsage(data.usage),
    });
    return stripReasoning(data.choices?.[0]?.message?.content ?? '');
  }

  private resolveTemperature(requested: number | undefined, reasoning: boolean): number {
    const temperature = requested ?? 0.7;
    return reasoning ? Math.max(temperature, REASONING_MIN_TEMPERATURE) : temperature;
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
