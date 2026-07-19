import { Logger } from '@nestjs/common';
import {
  DEFAULT_LLM_MAX_ATTEMPTS,
  DEFAULT_LLM_TIMEOUT_MS,
  LlmHttpError,
  MAX_LLM_TIMEOUT_MS,
  isRetryableStatus,
  postLlmJson,
  readLlmHttpConfig,
} from './llm-http';

/** Silent logger — these tests assert behaviour, not log output. */
function quietLogger(): Logger {
  const logger = new Logger('test');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  return logger;
}

type Attempt =
  | { status: number; body?: unknown; retryAfter?: string }
  | { throws: Error };

/** Script a sequence of fetch outcomes, one per attempt. */
function scriptFetch(attempts: Attempt[]): jest.Mock {
  const fn = jest.fn(async () => {
    const next = attempts.shift();
    if (!next) throw new Error('fetch called more times than scripted');
    if ('throws' in next) throw next.throws;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body ?? { ok: true },
      text: async () => 'error detail',
      headers: { get: (name: string) => (name === 'retry-after' ? next.retryAfter ?? null : null) },
    };
  });
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

function timeoutError(): Error {
  const err = new Error('The operation was aborted due to timeout');
  err.name = 'TimeoutError';
  return err;
}

/** Zero backoff so the suite stays fast; the delay itself is not under test. */
const OPTS = { label: 'Test', backoffBaseMs: 0 };

describe('postLlmJson', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('returns the parsed body on success', async () => {
    scriptFetch([{ status: 200, body: { hello: 'world' } }]);
    await expect(
      postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
    ).resolves.toEqual({ hello: 'world' });
  });

  it('sends an AbortSignal so a hung upstream cannot hold the call open', async () => {
    const fetchMock = scriptFetch([{ status: 200 }]);
    await postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() });
    const init = fetchMock.mock.calls[0][1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  describe('retries', () => {
    it('retries a 503 and returns the eventual success', async () => {
      const fetchMock = scriptFetch([
        { status: 503 },
        { status: 200, body: { recovered: true } },
      ]);
      await expect(
        postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
      ).resolves.toEqual({ recovered: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a timeout — the case that silently cost a paid artifact', async () => {
      const fetchMock = scriptFetch([
        { throws: timeoutError() },
        { status: 200, body: { recovered: true } },
      ]);
      await expect(
        postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
      ).resolves.toEqual({ recovered: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('gives up after maxAttempts and reports the last failure', async () => {
      const fetchMock = scriptFetch([{ status: 503 }, { status: 503 }, { status: 503 }]);
      await expect(
        postLlmJson(
          'https://x/y',
          { headers: {}, body: '{}' },
          { ...OPTS, logger: quietLogger(), maxAttempts: 3 },
        ),
      ).rejects.toThrow('status 503');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('surfaces a timed-out call as a timeout, not a generic failure', async () => {
      scriptFetch([{ throws: timeoutError() }]);
      await expect(
        postLlmJson(
          'https://x/y',
          { headers: {}, body: '{}' },
          { ...OPTS, logger: quietLogger(), maxAttempts: 1, timeoutMs: 1234 },
        ),
      ).rejects.toThrow('timed out after 1234ms');
    });

    it('honours Retry-After when the provider sends one', async () => {
      scriptFetch([{ status: 429, retryAfter: '0' }, { status: 200 }]);
      await expect(
        postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('permanent failures are not retried', () => {
    it.each([400, 401, 403, 404])('gives up immediately on %i', async (status) => {
      const fetchMock = scriptFetch([{ status }]);
      await expect(
        postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
      ).rejects.toThrow(`status ${status}`);
      // A bad key or a malformed request fails identically on every attempt —
      // retrying only delays the agent's fallback.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rethrows a non-transport error untouched', async () => {
      scriptFetch([{ throws: new RangeError('programmer error') }]);
      await expect(
        postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
      ).rejects.toBeInstanceOf(RangeError);
    });
  });

  it('carries status and retryability on the thrown error', async () => {
    scriptFetch([{ status: 401 }]);
    const err = await postLlmJson(
      'https://x/y',
      { headers: {}, body: '{}' },
      { ...OPTS, logger: quietLogger() },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHttpError);
    expect((err as LlmHttpError).status).toBe(401);
    expect((err as LlmHttpError).retryable).toBe(false);
  });
});

describe('isRetryableStatus', () => {
  it.each([408, 429, 500, 502, 503, 504])('treats %i as transient', (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('treats %i as permanent', (status) => {
    expect(isRetryableStatus(status)).toBe(false);
  });
});

describe('readLlmHttpConfig', () => {
  const read = (env: Record<string, string>) =>
    readLlmHttpConfig({ get: <T,>(key: string) => env[key] as T | undefined });

  it('falls back to the defaults when unset', () => {
    expect(read({})).toEqual({
      timeoutMs: DEFAULT_LLM_TIMEOUT_MS,
      maxAttempts: DEFAULT_LLM_MAX_ATTEMPTS,
    });
  });

  it('coerces the env strings — ConfigService.get<number>() does not', () => {
    const config = read({ LLM_TIMEOUT_MS: '5000', LLM_MAX_ATTEMPTS: '2' });
    expect(config).toEqual({ timeoutMs: 5000, maxAttempts: 2 });
    expect(typeof config.timeoutMs).toBe('number');
  });

  it.each(['nonsense', '0', '-1', ''])('ignores the unusable value %p', (raw) => {
    expect(read({ LLM_TIMEOUT_MS: raw }).timeoutMs).toBe(DEFAULT_LLM_TIMEOUT_MS);
  });
});

describe('hardening (post-review)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('tags a timeout with kind so callers need no message matching', async () => {
    scriptFetch([{ throws: timeoutError() }]);
    const err = await postLlmJson(
      'https://x/y',
      { headers: {}, body: '{}' },
      { ...OPTS, logger: quietLogger(), maxAttempts: 1 },
    ).catch((e: unknown) => e);

    expect((err as LlmHttpError).kind).toBe('timeout');
  });

  it('tags a network fault as network, not timeout', async () => {
    const undiciStyle = new TypeError('fetch failed');
    scriptFetch([{ throws: undiciStyle }]);
    const err = await postLlmJson(
      'https://x/y',
      { headers: {}, body: '{}' },
      { ...OPTS, logger: quietLogger(), maxAttempts: 1 },
    ).catch((e: unknown) => e);

    expect((err as LlmHttpError).kind).toBe('network');
  });

  it('does NOT retry a plain TypeError — that is our bug, not an outage', async () => {
    // Previously any TypeError was retried and reported as a network failure,
    // permanently disguising a code defect (e.g. a response without .text()).
    const bug = new TypeError('res.text is not a function');
    const fetchMock = scriptFetch([{ throws: bug }]);

    await expect(
      postLlmJson('https://x/y', { headers: {}, body: '{}' }, { ...OPTS, logger: quietLogger() }),
    ).rejects.toBe(bug);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still makes a request when maxAttempts is NaN', async () => {
    // Math.max(1, Math.floor(NaN)) is NaN, which skipped the loop entirely and
    // reported an outage for a request that was never sent.
    const fetchMock = scriptFetch([{ status: 200, body: { ok: true } }]);

    await expect(
      postLlmJson(
        'https://x/y',
        { headers: {}, body: '{}' },
        { ...OPTS, logger: quietLogger(), maxAttempts: Number('nope') },
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clamps an over-large timeout instead of overflowing the timer', async () => {
    // Past 2^31-1 ms a Node timer fires immediately, so an unclamped value would
    // abort every call at once — the inverse of what was configured.
    scriptFetch([{ throws: timeoutError() }]);
    const err = await postLlmJson(
      'https://x/y',
      { headers: {}, body: '{}' },
      { ...OPTS, logger: quietLogger(), maxAttempts: 1, timeoutMs: 5_000_000_000 },
    ).catch((e: unknown) => e);

    expect((err as Error).message).toContain(`${MAX_LLM_TIMEOUT_MS}ms`);
  });
});
