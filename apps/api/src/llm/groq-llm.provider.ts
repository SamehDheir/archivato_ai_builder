import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';

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
  private readonly defaultModel: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required to use the Groq provider');
    }
    this.apiKey = apiKey;
    this.defaultModel = config.get<string>('GROQ_MODEL', DEFAULT_MODEL);
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    const payload = {
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 0.7,
      messages: this.buildMessages(messages, options?.system),
    };

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      this.logger.error(`Groq request failed (${res.status}): ${detail}`);
      throw new Error(`Groq request failed with status ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
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
    const raw = await this.complete(jsonMessages, {
      temperature: 0,
      ...options,
    });
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
