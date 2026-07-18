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

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_MAX_TOKENS = 2048;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Free Groq provider via its OpenAI-compatible chat-completions API. Activated
 * for the interview when GROQ_API_KEY is set (see `LlmModule`). Uses the global
 * `fetch` (Node 18+) so no extra SDK dependency is required.
 *
 * Config: GROQ_API_KEY (required), GROQ_MODEL (default llama-3.3-70b-versatile).
 */
@Injectable()
export class GroqLlmProvider implements LlmProvider {
  readonly name = 'groq';

  private readonly logger = new Logger(GroqLlmProvider.name);
  private readonly apiKey: string;
  private readonly http: { timeoutMs: number; maxAttempts: number };
  readonly defaultModel: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required to use the Groq provider');
    }
    this.apiKey = apiKey;
    this.defaultModel = config.get<string>('GROQ_MODEL', DEFAULT_MODEL);
    this.http = readLlmHttpConfig(config);
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    return this.send(messages, options, false);
  }

  /**
   * Shared request path. `jsonMode` turns on Groq's native JSON output
   * (`response_format: json_object`), which constrains the model to emit a
   * single valid JSON object — the structured-output guarantee for the default
   * real-AI provider. (Groq requires the word "json" somewhere in the prompt for
   * this mode; the `completeJson` nudge below satisfies that.)
   */
  private async send(
    messages: LlmMessage[],
    options: LlmCompleteOptions | undefined,
    jsonMode: boolean,
  ): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const payload: Record<string, unknown> = {
      model,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 0.7,
      messages: this.buildMessages(messages, options?.system),
    };
    if (jsonMode) payload.response_format = { type: 'json_object' };

    const data = await postLlmJson<{
      choices?: { message?: { content?: string } }[];
      usage?: OpenAiStyleUsage;
    }>(
      GROQ_URL,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      { label: 'Groq', logger: this.logger, ...this.http },
    );
    options?.onUsage?.({ model, usage: readOpenAiUsage(data.usage) });
    return data.choices?.[0]?.message?.content ?? '';
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
