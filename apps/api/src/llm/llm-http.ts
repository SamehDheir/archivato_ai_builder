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
 * Ceiling on a single attempt's timeout.
 *
 * Node's timers are 32-bit: past 2^31-1 ms a `setTimeout` overflows and fires
 * almost immediately, so an over-large `LLM_TIMEOUT_MS` would abort every call
 * instantly — the exact inverse of what the operator asked for, with nothing in
 * the logs explaining it. Clamping is the only failure mode that stays honest.
 * (A day is already far past any real model call; the reasoning multiplier in
 * the SiliconFlow provider is applied before this clamp.)
 */
export const MAX_LLM_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** What kind of transport fault occurred — the reason classifier keys off this. */
export type LlmHttpErrorKind = 'http' | 'timeout' | 'network';

/**
 * A failed LLM HTTP call.
 *
 * The message keeps each provider's original
 * `"<Provider> request failed with status <n>"` wording so existing callers and
 * assertions keep working; `status`, `kind` and `retryable` are the
 * machine-readable additions.
 *
 * `kind` exists so callers can tell a timeout from an outage **without matching
 * on the message text**. The agent layer needs that distinction (it becomes the
 * artifact's `degradedReason`), and deriving it from prose built in this file
 * meant a reworded string would silently reclassify every timeout.
 */
export class LlmHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly kind: LlmHttpErrorKind = 'http',
    /**
     * The provider's raw error body, when there was one.
     *
     * Carried so a caller can tell a *generation* failure from a transport one
     * without re-parsing a log line: a provider running native JSON mode
     * validates server-side and rejects its own model's malformed output as a
     * 400, which looks like a bad request but means the call **succeeded and was
     * billed**. See `isGenerationFailure`.
     */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LlmHttpError';
  }
}

/**
 * Did the provider accept the request and fail to *generate* valid JSON?
 *
 * Groq answers a truncated or malformed JSON-mode completion with **400
 * `json_validate_failed`**, which `isRetryableStatus` correctly treats as
 * permanent — but "permanent" is the only thing it has in common with a bad API
 * key. The tokens were spent, and the fix is a bigger output budget or a tighter
 * prompt, not a look at the network. Reporting it as `call_failed` pointed every
 * future reader at the wrong layer.
 */
export function isGenerationFailure(err: unknown): boolean {
  return (
    err instanceof LlmHttpError &&
    err.status === 400 &&
    /json_validate_failed|failed to generate json/i.test(err.detail ?? '')
  );
}

/**
 * Was the request refused for being too big to fit the caller's rate tier?
 *
 * Providers count `max_tokens` against tokens-per-minute — it is capacity they
 * reserve — so a generous output budget can push a modest prompt over the limit
 * and be rejected **before the model runs**. Waiting does not help: the request
 * exceeds the per-minute ceiling on its own, so it fails identically forever.
 * The only thing that helps is asking for less, which is why this is separate
 * from `isRetryableStatus` (it is not retryable *as sent*) and why the caller
 * retries it with a smaller budget rather than the transport retrying it as-is.
 */
export function isRequestTooLarge(err: unknown): boolean {
  if (!(err instanceof LlmHttpError)) return false;
  if (err.status === 413) return true;
  return (
    err.status === 400 && /request too large|reduce your message size/i.test(err.detail ?? '')
  );
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

/**
 * Did the run out of time?
 *
 * `AbortSignal.timeout()` rejects with a DOMException named TimeoutError; an
 * otherwise-aborted fetch surfaces as AbortError. One helper because the retry
 * predicate and the message builder both need the answer, and a third abort-like
 * name added to only one of them would produce a call that retries correctly and
 * then reports the wrong reason.
 */
function isAbortLike(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Is this a genuine network fault, as opposed to a bug in our own code?
 *
 * undici reports DNS/TLS/connection failures as `TypeError('fetch failed')` with
 * the underlying error attached as `cause`. Treating **every** TypeError as a
 * network fault was too broad: a real programming error inside the request path
 * (a response object without `.text()`, say) would then be retried three times
 * and reported to the user as an outage, permanently disguising the bug.
 */
function isNetworkThrow(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  return err.message === 'fetch failed' || 'cause' in err;
}

/** Classify a thrown (non-HTTP) error: timeouts and network faults are transient. */
function isRetryableThrow(err: unknown): boolean {
  return isAbortLike(err) || isNetworkThrow(err);
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
  return isAbortLike(err)
    ? new LlmHttpError(
        `${label} request timed out after ${timeoutMs}ms`,
        null,
        true,
        'timeout',
      )
    : new LlmHttpError(`${label} request failed: network error`, null, true, 'network');
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

  // `Math.max(1, NaN)` is NaN, which would make the loop condition false on the
  // first pass — returning a "request failed" the operator would read as an
  // outage for a request that was never sent. Coerce to a usable count first.
  const attempts = positiveInt(maxAttempts, DEFAULT_LLM_MAX_ATTEMPTS);
  const budgetMs = Math.min(
    positiveInt(timeoutMs, DEFAULT_LLM_TIMEOUT_MS),
    MAX_LLM_TIMEOUT_MS,
  );
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let waitMs: number | null = null;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: init.headers,
        body: init.body,
        // A fresh signal per attempt — a signal only fires once.
        signal: AbortSignal.timeout(budgetMs),
      });

      if (res.ok) return (await res.json()) as T;

      const detail = await res.text().catch(() => res.statusText);
      const retryable = isRetryableStatus(res.status);
      // Only the FINAL outcome is an error. A 503 that succeeds on attempt 3 is
      // a non-event, and logging each attempt at error level buried the one line
      // that mattered under three that didn't — multiplied by every concurrent
      // pipeline stage during a provider blip.
      const detailLine = `${label} request failed (${res.status}): ${detail}`;
      if (retryable && attempt < attempts) logger.debug(detailLine);
      else logger.error(detailLine);
      const httpError = new LlmHttpError(
        `${label} request failed with status ${res.status}`,
        res.status,
        retryable,
        'http',
        detail,
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
      lastError = transportError(err, label, budgetMs);
      logger.debug(`${label} attempt ${attempt}/${attempts}: ${String(err)}`);
    }

    if (attempt < attempts) {
      const delay = waitMs ?? backoffMs(attempt, backoffBaseMs);
      logger.warn(
        `${label} attempt ${attempt}/${attempts} failed; retrying in ${delay}ms.`,
      );
      await sleep(delay);
    } else if (lastError instanceof Error) {
      // Exhausted: this is the line that matters, so it is the one at error level.
      logger.error(`${label} failed after ${attempts} attempts: ${lastError.message}`);
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
