import { ConfigService } from '@nestjs/config';
import { AzureOpenAiLlmProvider } from './azure-openai-llm.provider';
import { LlmJsonParseError } from './llm-provider.interface';

const ENV = {
  AZURE_OPENAI_API_KEY: 'secret-key',
  AZURE_OPENAI_ENDPOINT: 'https://my-resource.openai.azure.com',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4o',
};

/** Capture the fetch call args (url, init) and return a scripted completion. */
type FetchMock = jest.Mock<
  Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>,
  [string, RequestInit]
>;

function mockFetch(content: string, ok = true, status = 200): FetchMock {
  const fn = jest.fn(async (_url: string, _init: RequestInit) => ({
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => 'error detail',
  }));
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn as FetchMock;
}

/** The parsed JSON body of the Nth fetch call. */
function bodyOf(fn: FetchMock, call = 0): Record<string, unknown> {
  return JSON.parse(fn.mock.calls[call][1].body as string);
}

/** The headers of the Nth fetch call. */
function headersOf(fn: FetchMock, call = 0): Record<string, string> {
  return fn.mock.calls[call][1].headers as Record<string, string>;
}

function makeProvider(overrides: Record<string, string> = {}) {
  return new AzureOpenAiLlmProvider(
    new ConfigService({ ...ENV, ...overrides }),
  );
}

describe('AzureOpenAiLlmProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('is named "azure"', () => {
    expect(makeProvider().name).toBe('azure');
  });

  describe('required config', () => {
    it.each([
      ['AZURE_OPENAI_API_KEY'],
      ['AZURE_OPENAI_ENDPOINT'],
      ['AZURE_OPENAI_DEPLOYMENT'],
    ])('throws when %s is missing', (key) => {
      const env: Record<string, string> = { ...ENV };
      delete env[key];
      expect(() => new AzureOpenAiLlmProvider(new ConfigService(env))).toThrow(
        key,
      );
    });
  });

  it('calls the deployment URL with the api-version and the api-key header', async () => {
    const fetchMock = mockFetch('hello there');
    const result = await makeProvider().complete([
      { role: 'user', content: 'hi' },
    ]);

    expect(result).toBe('hello there');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://my-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21',
    );
    // Azure authenticates with an api-key header, NOT a Bearer token.
    expect(headersOf(fetchMock)['api-key']).toBe('secret-key');
    expect(headersOf(fetchMock)).not.toHaveProperty('Authorization');
    // The model is chosen by the deployment, so no `model` field is sent.
    expect(bodyOf(fetchMock)).not.toHaveProperty('model');
  });

  it('tolerates a trailing slash on the endpoint and honours a custom api-version', async () => {
    const fetchMock = mockFetch('ok');
    await makeProvider({
      AZURE_OPENAI_ENDPOINT: 'https://my-resource.openai.azure.com/',
      AZURE_OPENAI_API_VERSION: '2025-01-01-preview',
    }).complete([{ role: 'user', content: 'hi' }]);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://my-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview',
    );
  });

  it('maps an explicit `model` option onto the deployment segment of the URL', async () => {
    const fetchMock = mockFetch('ok');
    await makeProvider().complete([{ role: 'user', content: 'hi' }], {
      model: 'gpt-4o-mini',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/deployments/gpt-4o-mini/');
  });

  it('prepends an explicit system turn to the messages', async () => {
    const fetchMock = mockFetch('ok');
    await makeProvider().complete([{ role: 'user', content: 'hi' }], {
      system: 'You are an architect.',
    });
    expect(bodyOf(fetchMock).messages).toEqual([
      { role: 'system', content: 'You are an architect.' },
      { role: 'user', content: 'hi' },
    ]);
  });

  describe('completeJson', () => {
    it('enables native JSON mode, defaults temperature to 0, and parses the object', async () => {
      const fetchMock = mockFetch('{"ok":true}');
      const out = await makeProvider().completeJson<{ ok: boolean }>([
        { role: 'user', content: 'give me json' },
      ]);

      expect(out).toEqual({ ok: true });
      const body = bodyOf(fetchMock);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.temperature).toBe(0);
      // Azure requires the word "json" in the prompt for json_object mode — the
      // appended nudge satisfies that.
      const messages = body.messages as { content: string }[];
      expect(messages[messages.length - 1].content).toMatch(/json/i);
    });

    it('lets the caller override the temperature', async () => {
      const fetchMock = mockFetch('{"a":1}');
      await makeProvider().completeJson([{ role: 'user', content: 'x' }], {
        temperature: 0.4,
      });
      expect(bodyOf(fetchMock).temperature).toBe(0.4);
    });

    it('strips code fences via the shared parser', async () => {
      mockFetch('```json\n{"a":1}\n```');
      await expect(
        makeProvider().completeJson([{ role: 'user', content: 'x' }]),
      ).resolves.toEqual({ a: 1 });
    });

    it('throws LlmJsonParseError when the response is not JSON', async () => {
      mockFetch('sorry, no json today');
      await expect(
        makeProvider().completeJson([{ role: 'user', content: 'x' }]),
      ).rejects.toBeInstanceOf(LlmJsonParseError);
    });
  });

  it('throws with the status when Azure returns an error', async () => {
    mockFetch('', false, 429);
    await expect(
      // 429 is transient, so the shared transport would retry it — pin attempts
      // to 1 to assert the surfaced message without paying the backoff.
      makeProvider({ LLM_MAX_ATTEMPTS: '1' }).complete([
        { role: 'user', content: 'x' },
      ]),
    ).rejects.toThrow('status 429');
  });

  describe('shared HTTP transport', () => {
    it('sends an abort signal, so a hung Azure call cannot run forever', async () => {
      const fetchMock = mockFetch('ok');
      await makeProvider().complete([{ role: 'user', content: 'x' }]);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it('retries a transient failure rather than falling back on one blip', async () => {
      let call = 0;
      const fn = jest.fn(async () => {
        call++;
        return {
          ok: call > 1,
          status: call > 1 ? 200 : 503,
          json: async () => ({ choices: [{ message: { content: 'recovered' } }] }),
          text: async () => 'upstream unavailable',
        };
      });
      (global as unknown as { fetch: unknown }).fetch = fn;

      await expect(
        makeProvider().complete([{ role: 'user', content: 'x' }]),
      ).resolves.toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('respects LLM_MAX_ATTEMPTS from config', async () => {
      const fetchMock = mockFetch('', false, 503);
      await expect(
        makeProvider({ LLM_MAX_ATTEMPTS: '2' }).complete([
          { role: 'user', content: 'x' },
        ]),
      ).rejects.toThrow('status 503');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
