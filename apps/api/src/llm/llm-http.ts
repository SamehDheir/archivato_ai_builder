import { Logger } from '@nestjs/common';

/**
 * Shared HTTP transport for the OpenAI-shaped providers (Groq / Azure /
 * SiliconFlow), which all POST the same request shape and read the same
 * response shape. It exists to hold two things none of them had:
 *
 * 1. **A timeout.** Node's `fetch` has none. A hung upstream held a BullMQ
 *    worker or an open SSE connection *indefinitely* — on a small instance a
 *    handful of those is an outage. Every attempt now carries its own
 *    `AbortSignal.timeout`.
 * 2. **A retry.** A transient blip used to cost the user their artifact: the
 *    agent catches the failure and returns its deterministic fallback, so the
 *    stage "succeeds" and a paying user silently receives the templated
 *    document. Retrying here — *below* the agent's catch — is the only layer
 *    where a transient 503 is still visible as a transient 503.
 *
 * The retry deliberately does NOT live on the BullMQ job. Because every agent
 * falls back, `service.generate()` resolves and the job **completes**, so
 * `attempts` would never fire; and if it did, `PipelineProcessor` writes a
 * version snapshot per run, so a retry would re-persist and re-snapshot.
 */

/** Per-attempt wall-clock ceiling. Generous: a large artifact is a slow call. */
export const DEFAULT_LLM_TIMEOUT_MS = 90_000;

/** Total attempts, not retries — 3 means one call plus two retries. */
export const DEFAULT_LLM_MAX_ATTEMPTS = 3;

const DEFAULT_BACKOFF_BASE_MS = 500;
const MAX_BACKOFF_MS = 8_000;

/**
 * A failed LLM HTTP call.
 *
 * The message keeps each provider's original
 * `"<Provider> request failed with status <n>"` wording so existing callers and
 * assertions keep working; `status` and `retryable` are the machine-readable
 * additions.
 */
export class LlmHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmHttpError';
  }
}

/**
 * Transient statuses worth another attempt.
 *
 * 408 (request timeout) and 429 (rate limited) are explicitly temporary, and any
 * 5xx is the provider's own fault. Everything else — 400 (malformed request),
 * 401/403 (bad or unauthorized key), 404 (wrong deployment/model) — is
 * deterministic: a retry would fail identically and just burn latency.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Classify a thrown (non-HTTP) error: timeouts and network faults are transient. */
function isRetryableThrow(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name;
  // `AbortSignal.timeout()` rejects with a DOMException named TimeoutError;
  // an otherwise-aborted fetch surfaces as AbortError.
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  // undici reports DNS/TLS/connection failures as TypeError('fetch failed').
  return err instanceof TypeError;
}

/** `Retry-After` in seconds, when the provider sends a usable one. */
function retryAfterMs(res: { headers?: { get(name: string): string | null } }): number | null {
  const raw = res.headers?.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Cap it: a provider asking us to wait a minute exceeds the call's budget, and
  // failing over to the deterministic fallback beats holding a worker that long.
  return Math.min(seconds * 1000, MAX_BACKOFF_MS);
}

function backoffMs(attempt: number, baseMs: number): number {
  const exponential = Math.min(baseMs * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  // Jitter so concurrent pipeline stages don't retry in lockstep.
  return exponential + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Wrap a thrown transport fault as an `LlmHttpError` with a readable message. */
function transportError(err: unknown, label: string, timeoutMs: number): LlmHttpError {
  const name = (err as { name?: string } | null | undefined)?.name;
  const timedOut = name === 'TimeoutError' || name === 'AbortError';
  return new LlmHttpError(
    timedOut
      ? `${label} request timed out after ${timeoutMs}ms`
      : `${label} request failed: network error`,
    null,
    true,
  );
}

export interface LlmFetchOptions {
  /** Provider name used in log lines and error messages, e.g. "Groq". */
  label: string;
  logger: Logger;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Backoff base; tests set 0 to keep the suite fast. */
  backoffBaseMs?: number;
}

/**
 * POST a JSON body and return the parsed JSON response, with a per-attempt
 * timeout and bounded retries on transient failures.
 *
 * Note on metering: a timed-out attempt may still have been billed upstream (the
 * model can finish after we hang up), but no usage is reported because usage is
 * read off a response we never received. Retries therefore under-report spend
 * slightly rather than over-report it — the honest direction for a margin meter.
 */
export async function postLlmJson<T>(
  url: string,
  init: { headers: Record<string, string>; body: string },
  options: LlmFetchOptions,
): Promise<T> {
  const {
    label,
    logger,
    timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
    maxAttempts = DEFAULT_LLM_MAX_ATTEMPTS,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
  } = options;

  const attempts = Math.max(1, Math.floor(maxAttempts));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let waitMs: number | null = null;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: init.headers,
        body: init.body,
        // A fresh signal per attempt — a signal only fires once.
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) return (await res.json()) as T;

      const detail = await res.text().catch(() => res.statusText);
      const retryable = isRetryableStatus(res.status);
      logger.error(`${label} request failed (${res.status}): ${detail}`);
      const httpError = new LlmHttpError(
        `${label} request failed with status ${res.status}`,
        res.status,
        retryable,
      );
      // A permanent status is terminal — leave the loop rather than burn latency
      // on attempts that would fail identically.
      if (!retryable) throw httpError;
      lastError = httpError;
      waitMs = retryAfterMs(res);
    } catch (err) {
      // Retryable HTTP failures are *assigned* above, never thrown — so the only
      // LlmHttpError that can land here is the terminal one just raised.
      if (err instanceof LlmHttpError) throw err;
      if (!isRetryableThrow(err)) throw err;
      lastError = transportError(err, label, timeoutMs);
      logger.warn(`${label} attempt ${attempt}/${attempts} failed: ${String(err)}`);
    }

    if (attempt < attempts) {
      const delay = waitMs ?? backoffMs(attempt, backoffBaseMs);
      logger.warn(
        `${label} attempt ${attempt}/${attempts} failed; retrying in ${delay}ms.`,
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new LlmHttpError(`${label} request failed`, null, true);
}

/**
 * Read the shared timeout / attempt settings.
 *
 * `ConfigService.get<number>()` does **not** coerce an env string, so both are
 * parsed explicitly — a string `timeoutMs` would be passed straight to
 * `AbortSignal.timeout` and silently misbehave.
 */
export function readLlmHttpConfig(config: {
  get<T>(key: string): T | undefined;
}): { timeoutMs: number; maxAttempts: number } {
  return {
    timeoutMs: positiveInt(config.get<string>('LLM_TIMEOUT_MS'), DEFAULT_LLM_TIMEOUT_MS),
    maxAttempts: positiveInt(
      config.get<string>('LLM_MAX_ATTEMPTS'),
      DEFAULT_LLM_MAX_ATTEMPTS,
    ),
  };
}

function positiveInt(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
