import { Injectable } from '@nestjs/common';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { parseJsonFromLlm } from './json.util';

/**
 * A function that produces a deterministic raw response for a given prompt.
 * Tests register these to script the LLM without any network calls.
 */
export type MockResponder = (
  messages: LlmMessage[],
  options?: LlmCompleteOptions,
) => string;

/**
 * Offline, deterministic `LlmProvider`. This is the DEFAULT provider so the
 * entire pipeline can be developed and tested with zero API cost or network.
 *
 * Behaviour, in order of precedence:
 *   1. A one-shot queue (`enqueue`) — each call shifts the next scripted reply.
 *   2. A custom `responder` set via the constructor or `setResponder`.
 *   3. A built-in default that echoes the last user message as JSON.
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  private responder: MockResponder;
  private readonly queue: string[] = [];

  constructor(responder?: MockResponder) {
    this.responder = responder ?? defaultResponder;
  }

  /** Replace the fallback responder used when the queue is empty. */
  setResponder(responder: MockResponder): void {
    this.responder = responder;
  }

  /** Queue scripted raw responses, consumed FIFO by subsequent calls. */
  enqueue(...rawResponses: string[]): void {
    this.queue.push(...rawResponses);
  }

  /** Convenience: queue an object that will be JSON-stringified. */
  enqueueJson(...objects: unknown[]): void {
    this.queue.push(...objects.map((o) => JSON.stringify(o)));
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string> {
    if (this.queue.length > 0) {
      return this.queue.shift() as string;
    }
    return this.responder(messages, options);
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T> {
    const raw = await this.complete(messages, options);
    return parseJsonFromLlm<T>(raw);
  }
}

function defaultResponder(messages: LlmMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return JSON.stringify({
    provider: 'mock',
    echo: lastUser?.content ?? '',
  });
}
