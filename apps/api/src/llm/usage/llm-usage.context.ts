import { AsyncLocalStorage } from 'node:async_hooks';
import type { ArtifactLanguage, LlmUsageStage } from '@archivato/shared';
import { DEFAULT_ARTIFACT_LANGUAGE } from '@archivato/shared';

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
 * It also carries the project's **artifact language**, for the same reason and
 * over the same two seams — see `resolveLanguage` below.
 *
 * Anything that runs outside both simply records with no user and stage `other`.
 */
export interface LlmCallContext {
  userId: string | null;
  sessionId: string | null;
  stage: LlmUsageStage;
  /**
   * The language this project's artifacts are generated in — resolved **lazily**.
   *
   * It rides on this context for exactly the reason the context exists: fifteen
   * agents interpolate client text and every one of them needs to be told what
   * language to answer in, and threading that down through a dozen stage services
   * is the wide invasive change this seam already exists to avoid. Establishing it
   * in the same two places as the attribution above means a new agent, a new
   * stage, and a new service are all localized without touching any of them.
   *
   * A **thunk**, not a value, because resolving it costs a session read and this
   * interceptor runs on every HTTP request — including the many that never touch
   * a model. `BaseAgent` calls it only when it is actually building a prompt, so
   * a request that makes no LLM call pays nothing. Implementations memoize, so a
   * pipeline stage making several calls reads the session once.
   */
  resolveLanguage?: () => Promise<ArtifactLanguage>;
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

/**
 * The artifact language for the current async chain.
 *
 * Falls back to the default when there is no context (a script, a test, a call
 * made outside any request) or when resolution fails — a session that vanished
 * mid-generation, or a database blip. Failing the *whole generation* because we
 * could not confirm a language would trade a working English artifact for none
 * at all, which is the wrong direction for a resilience layer.
 */
export async function currentArtifactLanguage(): Promise<ArtifactLanguage> {
  const resolve = storage.getStore()?.resolveLanguage;
  if (!resolve) return DEFAULT_ARTIFACT_LANGUAGE;
  try {
    return await resolve();
  } catch {
    return DEFAULT_ARTIFACT_LANGUAGE;
  }
}

/**
 * Wrap a session lookup in the memoizing thunk this context expects.
 *
 * Both establishing sites — the HTTP interceptor and the BullMQ worker — need
 * the identical "look it up once, on demand, and never throw into the caller"
 * behaviour, so it is written once here rather than twice at the call sites.
 */
export function lazyArtifactLanguage(
  load: () => Promise<ArtifactLanguage>,
): () => Promise<ArtifactLanguage> {
  let pending: Promise<ArtifactLanguage> | undefined;
  return () => (pending ??= load());
}

