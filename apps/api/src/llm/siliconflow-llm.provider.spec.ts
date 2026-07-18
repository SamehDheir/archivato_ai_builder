import { ConfigService } from '@nestjs/config';
import {
  SiliconFlowLlmProvider,
  isReasoningModel,
  stripReasoning,
  supportsJsonMode,
} from './siliconflow-llm.provider';
import { LlmJsonParseError } from './llm-provider.interface';
import type { LlmUsageReport } from './llm-provider.interface';

const ENV = { SILICONFLOW_API_KEY: 'secret-key' };

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
  ok = true,
  status = 200,
): FetchMock {
  const fn = jest.fn(async (_url: string, _init: RequestInit) => ({
    ok,
    status,
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
  return new SiliconFlowLlmProvider(new ConfigService({ ...ENV, ...overrides }));
}

describe('stripReasoning', () => {
  it('removes a closed think block', () => {
    expect(stripReasoning('<think>weighing options</think>{"a":1}')).toBe('{"a":1}');
  });

  // The reason this exists: R1 drafts and revises JSON while thinking, so the
  // balanced-brace scan would lock onto a discarded draft rather than the answer.
  it('keeps the answer, not the draft JSON inside the reasoning', () => {
    const raw = '<think>maybe {"a":0}? no.</think>\n{"a":1}';
    expect(JSON.parse(stripReasoning(raw))).toEqual({ a: 1 });
  });

  it('yields empty for a response cut off mid-thought', () => {
    expect(stripReasoning('<think>still reasoning and then the tokens ran')).toBe('');
  });

  it('leaves ordinary content untouched', () => {
    expect(stripReasoning('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('model capability predicates', () => {
  it('treats the R1 family as reasoning models', () => {
    expect(isReasoningModel('deepseek-ai/DeepSeek-R1')).toBe(true);
    expect(isReasoningModel('Qwen/QwQ-32B')).toBe(true);
    expect(isReasoningModel('Qwen/Qwen2.5-72B-Instruct')).toBe(false);
  });

  // Not `!isReasoningModel`: V3 is not a reasoning model and still rejects it.
  it('withholds JSON mode from the whole deepseek family', () => {
    expect(supportsJsonMode('deepseek-ai/DeepSeek-R1')).toBe(false);
    expect(supportsJsonMode('deepseek-ai/DeepSeek-V3')).toBe(false);
    expect(supportsJsonMode('Qwen/Qwen2.5-72B-Instruct')).toBe(true);
  });
});

describe('SiliconFlowLlmProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('requires an API key', () => {
    expect(() => new SiliconFlowLlmProvider(new ConfigService({}))).toThrow(
      /SILICONFLOW_API_KEY/,
    );
  });

  it('defaults to DeepSeek-R1 and posts to the public endpoint with a bearer token', async () => {
    const fn = mockFetch('hello');
    const provider = makeProvider();
    expect(provider.defaultModel).toBe('deepseek-ai/DeepSeek-R1');

    await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(fn.mock.calls[0][0]).toBe(
      'https://api.siliconflow.com/v1/chat/completions',
    );
    expect(
      (fn.mock.calls[0][1].headers as Record<string, string>).Authorization,
    ).toBe('Bearer secret-key');
    expect(bodyOf(fn).model).toBe('deepseek-ai/DeepSeek-R1');
  });

  it('trims a trailing slash off a custom base URL', async () => {
    const fn = mockFetch('hello');
    await makeProvider({
      SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1/',
    }).complete([{ role: 'user', content: 'hi' }]);

    expect(fn.mock.calls[0][0]).toBe('https://api.siliconflow.cn/v1/chat/completions');
  });

  // R1 rejects response_format outright, so sending it would break every call.
  it('omits JSON mode for a reasoning model but still parses the JSON', async () => {
    const fn = mockFetch('<think>drafting</think>{"ok":true}');
    const out = await makeProvider().completeJson<{ ok: boolean }>([
      { role: 'user', content: 'hi' },
    ]);

    expect(bodyOf(fn).response_format).toBeUndefined();
    expect(out).toEqual({ ok: true });
  });

  it('sends native JSON mode for a model that supports it', async () => {
    const fn = mockFetch('{"ok":true}');
    await makeProvider({ SILICONFLOW_MODEL: 'Qwen/Qwen2.5-72B-Instruct' }).completeJson(
      [{ role: 'user', content: 'hi' }],
    );

    expect(bodyOf(fn).response_format).toEqual({ type: 'json_object' });
  });

  // The caller's maxTokens budgets the ARTIFACT; thinking must not eat it.
  it('adds reasoning headroom on top of the caller budget', async () => {
    const fn = mockFetch('hi');
    await makeProvider().complete([{ role: 'user', content: 'hi' }], {
      maxTokens: 4096,
    });

    expect(bodyOf(fn).max_tokens).toBe(4096 + 8192);
  });

  it('passes maxTokens through untouched for a non-reasoning model', async () => {
    const fn = mockFetch('hi');
    await makeProvider({ SILICONFLOW_MODEL: 'Qwen/Qwen2.5-72B-Instruct' }).complete(
      [{ role: 'user', content: 'hi' }],
      { maxTokens: 4096 },
    );

    expect(bodyOf(fn).max_tokens).toBe(4096);
  });

  // temperature 0 sends R1 into endless repetition.
  it('floors the temperature for a reasoning model', async () => {
    const fn = mockFetch('{"ok":true}');
    await makeProvider().completeJson([{ role: 'user', content: 'hi' }]);

    expect(bodyOf(fn).temperature).toBe(0.6);
  });

  it('honours temperature 0 for a non-reasoning model', async () => {
    const fn = mockFetch('{"ok":true}');
    await makeProvider({ SILICONFLOW_MODEL: 'Qwen/Qwen2.5-72B-Instruct' }).completeJson(
      [{ role: 'user', content: 'hi' }],
    );

    expect(bodyOf(fn).temperature).toBe(0);
  });

  it('reports usage against the model the API echoed back', async () => {
    mockFetch('hi', {
      model: 'deepseek-ai/DeepSeek-R1',
      usage: { prompt_tokens: 100, completion_tokens: 900 },
    });
    const reports: LlmUsageReport[] = [];
    await makeProvider({ SILICONFLOW_MODEL: 'alias' }).complete(
      [{ role: 'user', content: 'hi' }],
      { onUsage: (r) => reports.push(r) },
    );

    expect(reports[0].model).toBe('deepseek-ai/DeepSeek-R1');
    expect(reports[0].usage.promptTokens).toBe(100);
    expect(reports[0].usage.completionTokens).toBe(900);
  });

  it('throws on a non-OK response without leaking the key', async () => {
    mockFetch('', {}, false, 429);
    await expect(
      makeProvider().complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('SiliconFlow request failed with status 429');
  });

  // A response truncated mid-thought has no answer in it; falling back beats
  // parsing half a thought.
  it('throws a parse error when the answer never arrived', async () => {
    mockFetch('<think>still going');
    await expect(
      makeProvider().completeJson([{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(LlmJsonParseError);
  });
});
