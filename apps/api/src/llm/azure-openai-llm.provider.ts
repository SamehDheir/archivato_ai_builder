import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';

/** GA api-version that supports `response_format: json_object`. */
const DEFAULT_API_VERSION = '2024-10-21';
const DEFAULT_MAX_TOKENS = 2048;

/**
 * Azure OpenAI provider via its chat-completions API. Shape-compatible with
 * OpenAI (so this mirrors `GroqLlmProvider`), with three Azure specifics:
 *   - the model is chosen by the **deployment name in the URL**, not a `model`
 *     field (`options.model` overrides the deployment);
 *   - auth is an **`api-key` header**, not a Bearer token;
 *   - the request must carry an **`api-version`** query param.
 *
 * Uses the global `fetch` (Node 18+) so no extra SDK dependency is required.
 * Targets chat deployments (gpt-4o / gpt-4.1 / gpt-35-turbo); the o-series
 * reasoning models reject `temperature` and want `max_completion_tokens`.
 *
 * Config: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT
 * (all required), AZURE_OPENAI_API_VERSION (default 2024-10-21).
 */
@Injectable()
export class AzureOpenAiLlmProvider implements LlmProvider {
  readonly name = 'azure';

  private readonly logger = new Logger(AzureOpenAiLlmProvider.name);
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly deployment: string;
  private readonly apiVersion: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('AZURE_OPENAI_API_KEY');
    const endpoint = config.get<string>('AZURE_OPENAI_ENDPOINT');
    const deployment = config.get<string>('AZURE_OPENAI_DEPLOYMENT');
    if (!apiKey) {
      throw new Error(
        'AZURE_OPENAI_API_KEY is required to use the Azure OpenAI provider',
      );
    }
    if (!endpoint) {
      throw new Error(
        'AZURE_OPENAI_ENDPOINT is required to use the Azure OpenAI provider',
      );
    }
    if (!deployment) {
      throw new Error(
        'AZURE_OPENAI_DEPLOYMENT is required to use the Azure OpenAI provider',
      );
    }
    this.apiKey = apiKey;
    // Tolerate a trailing slash on the resource endpoint.
    this.endpoint = endpoint.trim().replace(/\/+$/, '');
    this.deployment = deployment;
    this.apiVersion = config.get<string>(
      'AZURE_OPENAI_API_VERSION',
      DEFAULT_API_VERSION,
    );
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

  /**
   * Shared request path. `jsonMode` turns on the native JSON output
   * (`response_format: json_object`), which constrains the model to a single
   * valid JSON object. (Azure, like OpenAI, requires the word "json" somewhere in
   * the prompt for this mode; the `completeJson` nudge above satisfies that.)
   */
  private async send(
    messages: LlmMessage[],
    options: LlmCompleteOptions | undefined,
    jsonMode: boolean,
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 0.7,
      messages: this.buildMessages(messages, options?.system),
    };
    if (jsonMode) payload.response_format = { type: 'json_object' };

    // Azure selects the model by deployment, so an explicit `model` option maps
    // onto the deployment segment of the URL rather than a body field.
    const url = this.buildUrl(options?.model ?? this.deployment);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      this.logger.error(`Azure OpenAI request failed (${res.status}): ${detail}`);
      throw new Error(`Azure OpenAI request failed with status ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  private buildUrl(deployment: string): string {
    return (
      `${this.endpoint}/openai/deployments/${encodeURIComponent(deployment)}` +
      `/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`
    );
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
