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
  private readonly defaultModel: string;

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

    const response = await this.client.messages.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature,
      system: system || undefined,
      messages: conversation.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
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
