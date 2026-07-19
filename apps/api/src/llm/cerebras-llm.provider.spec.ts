import { ConfigService } from '@nestjs/config';
import {
  CerebrasLlmProvider,
  isReasoningModel,
  stripReasoning,
} from './cerebras-llm.provider';
import { LlmJsonParseError } from './llm-provider.interface';
import type { LlmUsageReport } from './llm-provider.interface';

const ENV = { CEREBRAS_API_KEY: 'secret-key' };

type FetchMock = jest.Mock<
  Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>,
  [string, RequestInit]
>;

function mockFetch(
  content: string,
  extra: Record<string, unknown> = {},
): FetchMock {
  const fn = jest.fn(async (_url: string, _init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], ...extra }),
    text: async () => 'error detail',
  }));
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn as FetchMock;
}

function bodyOf(fn: FetchMock, call = 0): Record<string, unknown> {
  return JSON.parse(fn.mock.calls[call][1].body as string);
}

function makeProvider(overrides: Record<string, string> = {}) {
  return new CerebrasLlmProvider(new ConfigService({ ...ENV, ...overrides }));
}

describe('CerebrasLlmProvider config', () => {
  it('requires an API key', () => {
    expect(() => new CerebrasLlmProvider(new ConfigService({}))).toThrow(
      /CEREBRAS_API_KEY/,
    );
  });

  it('defaults to the production model, not the deprecating preview one', () => {
    expect(makeProvider().defaultModel).toBe('gpt-oss-120b');
    expect(makeProvider({ CEREBRAS_MODEL: 'gemma-4-31b' }).defaultModel).toBe(
      'gemma-4-31b',
    );
  });

  it('reports its own name for provenance and metering', () => {
    expect(makeProvider().name).toBe('cerebras');
  });
});

describe('CerebrasLlmProvider request shape', () => {
  it('posts to the chat-completions endpoint with bearer auth', async () => {
    const fetchMock = mockFetch('hello');
    await makeProvider().complete([{ role: 'user', content: 'hi' }]);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.cerebras.ai/v1/chat/completions',
    );
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');
  });

  /**
   * The single most likely way to break this provider while every other
   * OpenAI-shaped one keeps working: Cerebras dropped the legacy `max_tokens`.
   */
  it('sends max_completion_tokens and never max_tokens', async () => {
    const fetchMock = mockFetch('hello');
    await makeProvider({ CEREBRAS_MODEL: 'gemma-4-31b' }).complete(
      [{ role: 'user', content: 'hi' }],
      { maxTokens: 1024 },
    );

    const body = bodyOf(fetchMock);
    expect(body.max_completion_tokens).toBe(1024);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('grants a reasoning model extra output budget on top of the caller request', async () => {
    const fetchMock = mockFetch('hello');
    // The caller's `maxTokens` means "room for the artifact" everywhere else, so
    // thinking must not eat it.
    await makeProvider().complete([{ role: 'user', content: 'hi' }], {
      maxTokens: 2048,
    });

    expect(bodyOf(fetchMock).max_completion_tokens).toBeGreaterThan(2048);
  });

  it('honours a custom base URL without doubling the slash', async () => {
    const fetchMock = mockFetch('hello');
    await makeProvider({ CEREBRAS_BASE_URL: 'https://proxy.internal/v1/' }).complete([
      { role: 'user', content: 'hi' },
    ]);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://proxy.internal/v1/chat/completions',
    );
  });

  it('puts an explicit system prompt first', async () => {
    const fetchMock = mockFetch('hello');
    await makeProvider().complete([{ role: 'user', content: 'hi' }], {
      system: 'You are terse.',
    });

    const messages = bodyOf(fetchMock).messages as { role: string }[];
    expect(messages[0]).toEqual({ role: 'system', content: 'You are terse.' });
  });
});

describe('CerebrasLlmProvider completeJson', () => {
  it('asks for native JSON mode and parses the result', async () => {
    const fetchMock = mockFetch('{"ok":true}');
    const out = await makeProvider().completeJson<{ ok: boolean }>([
      { role: 'user', content: 'give me json' },
    ]);

    expect(out).toEqual({ ok: true });
    expect(bodyOf(fetchMock).response_format).toEqual({ type: 'json_object' });
  });

  it('defaults to temperature 0 but lets a caller override it', async () => {
    let fetchMock = mockFetch('{"ok":true}');
    await makeProvider().completeJson([{ role: 'user', content: 'x' }]);
    expect(bodyOf(fetchMock).temperature).toBe(0);

    fetchMock = mockFetch('{"ok":true}');
    await makeProvider().completeJson([{ role: 'user', content: 'x' }], {
      temperature: 0.4,
    });
    expect(bodyOf(fetchMock).temperature).toBe(0.4);
  });

  it('throws a parse error on unusable output so the agent falls back', async () => {
    mockFetch('not json at all');
    await expect(
      makeProvider().completeJson([{ role: 'user', content: 'x' }]),
    ).rejects.toBeInstanceOf(LlmJsonParseError);
  });

  it('reports usage for the meter', async () => {
    mockFetch('{"ok":true}', {
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    });
    const reports: LlmUsageReport[] = [];

    await makeProvider().completeJson([{ role: 'user', content: 'x' }], {
      onUsage: (r) => reports.push(r),
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].model).toBe('gpt-oss-120b');
    expect(reports[0].usage.promptTokens).toBe(120);
    expect(reports[0].usage.completionTokens).toBe(30);
  });
});

describe('isReasoningModel', () => {
  it('recognises the gpt-oss default', () => {
    expect(isReasoningModel('gpt-oss-120b')).toBe(true);
    expect(isReasoningModel('zai-glm-4.7')).toBe(true);
  });

  it('does not treat a plain instruct model as reasoning', () => {
    expect(isReasoningModel('gemma-4-31b')).toBe(false);
  });
});

describe('stripReasoning', () => {
  it('removes a closed think block', () => {
    expect(stripReasoning('<think>weighing options</think>{"a":1}')).toBe('{"a":1}');
  });

  // A reasoning model drafts and revises JSON while thinking, so a leaked block
  // would make the balanced-brace scan lock onto a discarded draft.
  it('keeps the answer, not the draft JSON inside the reasoning', () => {
    expect(JSON.parse(stripReasoning('<think>maybe {"a":0}? no.</think>\n{"a":1}'))).toEqual(
      { a: 1 },
    );
  });

  it('yields empty for a response cut off mid-thought', () => {
    expect(stripReasoning('<think>still reasoning and then the tokens ran')).toBe('');
  });

  it('leaves an ordinary answer untouched', () => {
    expect(stripReasoning('{"a":1}')).toBe('{"a":1}');
  });
});
