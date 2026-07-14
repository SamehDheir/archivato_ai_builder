import { AsyncLocalStorage } from 'node:async_hooks';
import type { LlmUsageStage } from '@archivato/shared';

/**
 * Who/what an LLM call is being made *for*. The provider seam can see the model
 * and the tokens but has no idea which user or stage asked for them, and threading
 * that through 14 agents and a dozen services would be a wide, invasive change.
 *
 * So the caller establishes it once, ambiently, and the usage decorator reads it:
 *   - HTTP  → `LlmContextInterceptor` (global) — covers every LLM-backed route,
 *             including the SSE stream, chat refine, explain, and support AI;
 *   - queue → `PipelineProcessor` — the BullMQ worker has no request to read.
 *
 * Anything that runs outside both simply records with no user and stage `other`.
 */
export interface LlmCallContext {
  userId: string | null;
  sessionId: string | null;
  stage: LlmUsageStage;
}

const storage = new AsyncLocalStorage<LlmCallContext>();

/** Run `fn` (and everything it awaits) with this attribution context attached. */
export function runWithLlmContext<T>(ctx: LlmCallContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The attribution context of the current async chain, if any. */
export function currentLlmContext(): LlmCallContext | undefined {
  return storage.getStore();
}
