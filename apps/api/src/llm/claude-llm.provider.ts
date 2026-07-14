import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Real Claude provider via the Anthropic SDK. Activated when
 * LLM_PROVIDER=claude. Reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from config.
 *
 * Note: the model id is configurable; claude-opus-4-8 is the most capable
 * option if you want to bump it from the default sonnet.
 */
@Injectable()
export class ClaudeLlmProvider implements LlmProvider {
  readonly name = 'claude';

  private readonly logger = new Logger(ClaudeLlmProvider.name);
  private readonly client: Anthropic;
  readonly defaultModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.defaultModel = this.config.get<string>(
      'ANTHROPIC_MODEL',
      DEFAULT_MODEL,
    );
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    const { system, conversation } = splitSystem(messages, options?.system);
    const model = options?.model ?? this.defaultModel;

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      // Newer Claude models (Opus 4.7/4.8, Sonnet 5, Fable/Mythos 5) REJECT
      // sampling params with a 400 — only send temperature to models that still
      // accept it, so bumping ANTHROPIC_MODEL never breaks every agent call.
      ...(options?.temperature !== undefined && modelAcceptsSampling(model)
        ? { temperature: options.temperature }
        : {}),
      // Cache the (stable, per-agent) system prompt. Harmless no-op below the
      // model's minimum cacheable size; a win when an agent is called repeatedly
      // in a session (e.g. the adaptive interview) or the prompt is large.
      system: cacheableSystem(system),
      messages: conversation.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    // Anthropic reports the UNCACHED remainder in `input_tokens` and the cache
    // tokens separately — sum them so `promptTokens` is the true prompt size.
    const usage = response.usage;
    const cachedPromptTokens = usage?.cache_read_input_tokens ?? 0;
    const cacheWritePromptTokens = usage?.cache_creation_input_tokens ?? 0;
    options?.onUsage?.({
      model,
      usage: {
        promptTokens:
          (usage?.input_tokens ?? 0) + cachedPromptTokens + cacheWritePromptTokens,
        completionTokens: usage?.output_tokens ?? 0,
        cachedPromptTokens,
        cacheWritePromptTokens,
      },
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T> {
    // Nudge the model toward pure JSON and keep it deterministic.
    const jsonMessages: LlmMessage[] = [
      ...messages,
      {
        role: 'user',
        content:
          'Respond with a single valid JSON value only. No prose, no markdown fences.',
      },
    ];
    const raw = await this.complete(jsonMessages, {
      temperature: 0,
      ...options,
    });
    return parseJsonFromLlm<T>(raw);
  }
}

/**
 * Whether a model still accepts the `temperature`/`top_p`/`top_k` sampling
 * params. Opus 4.7/4.8, Sonnet 5, and Fable/Mythos 5 removed them (a 400 if
 * sent); everything Sonnet 4.6 / Opus 4.6 and older keeps them.
 */
function modelAcceptsSampling(model: string): boolean {
  return !/(opus-4-[78]|sonnet-5|fable-5|mythos-5|mythos-preview)/i.test(model);
}

/**
 * Render the system prompt as a single cache-marked text block so the stable
 * prefix can be served from Anthropic's prompt cache on repeated calls. Returns
 * `undefined` when there is no system prompt.
 */
function cacheableSystem(
  system: string,
): Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined;
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

/**
 * The Anthropic API takes `system` separately from the message list, and the
 * conversation may only contain user/assistant turns. Pull any system messages
 * (plus an explicit `options.system`) out into a single system string.
 */
function splitSystem(
  messages: LlmMessage[],
  explicitSystem?: string,
): { system: string; conversation: LlmMessage[] } {
  const systemParts: string[] = [];
  if (explicitSystem) systemParts.push(explicitSystem);

  const conversation: LlmMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else conversation.push(m);
  }

  return { system: systemParts.join('\n\n'), conversation };
}
