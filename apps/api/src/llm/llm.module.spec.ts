import {
  mockOverriddenKeys,
  selectProviderKind,
  selectInterviewKind,
} from './llm.module';

describe('selectProviderKind (one-switch resolution)', () => {
  it('defaults to mock with no key and no override', () => {
    expect(selectProviderKind(undefined)).toBe('mock');
    expect(selectProviderKind('', {})).toBe('mock');
    expect(selectProviderKind('', { groq: '' })).toBe('mock');
  });

  it('flips every agent to groq when GROQ_API_KEY is set', () => {
    expect(selectProviderKind(undefined, { groq: 'gsk_real_key' })).toBe('groq');
  });

  it('lets LLM_PROVIDER force a specific provider over the key', () => {
    expect(selectProviderKind('mock', { groq: 'gsk_real_key' })).toBe('mock');
    expect(selectProviderKind('claude', { groq: 'gsk_real_key' })).toBe('claude');
  });

  it('treats a blank LLM_PROVIDER as unset', () => {
    expect(selectProviderKind('  ', { groq: 'gsk_real_key' })).toBe('groq');
  });

  it('falls back to azure when only AZURE_OPENAI_API_KEY is set', () => {
    expect(selectProviderKind(undefined, { azure: 'az_key' })).toBe('azure');
    expect(selectProviderKind(undefined, { groq: '', azure: 'az_key' })).toBe('azure');
  });

  it('falls back to siliconflow when only SILICONFLOW_API_KEY is set', () => {
    expect(selectProviderKind(undefined, { siliconflow: 'sf_key' })).toBe('siliconflow');
  });

  it('falls back to cerebras when only CEREBRAS_API_KEY is set', () => {
    expect(selectProviderKind(undefined, { cerebras: 'csk_key' })).toBe('cerebras');
  });

  /**
   * The invariant behind `PROVIDER_PRIORITY`: adding a key must never move an
   * existing install off the provider it has been running on. Cerebras is free
   * like Groq, and still goes last — arriving later is what decides the order,
   * not how good the free tier is.
   */
  it('holds the priority order groq > azure > siliconflow > cerebras', () => {
    const all = {
      groq: 'gsk',
      azure: 'az',
      siliconflow: 'sf',
      cerebras: 'csk',
    };
    expect(selectProviderKind(undefined, all)).toBe('groq');
    expect(selectProviderKind(undefined, { ...all, groq: undefined })).toBe('azure');
    expect(
      selectProviderKind(undefined, { ...all, groq: undefined, azure: undefined }),
    ).toBe('siliconflow');
    expect(selectProviderKind(undefined, { cerebras: 'csk' })).toBe('cerebras');
  });

  it('lets LLM_PROVIDER force any provider over every key', () => {
    const all = { groq: 'gsk', azure: 'az', siliconflow: 'sf', cerebras: 'csk' };
    for (const kind of ['siliconflow', 'cerebras', 'azure', 'mock', 'claude']) {
      expect(selectProviderKind(kind, all)).toBe(kind);
    }
  });
});

describe('mockOverriddenKeys (silent-mock guard)', () => {
  const env = (vars: Record<string, string>) => (key: string) => vars[key];

  it('reports the real keys being ignored when mock is forced', () => {
    expect(mockOverriddenKeys('mock', env({ GROQ_API_KEY: 'gsk_real' }))).toEqual([
      'GROQ_API_KEY',
    ]);
    expect(
      mockOverriddenKeys(
        'mock',
        env({ GROQ_API_KEY: 'gsk_real', AZURE_OPENAI_API_KEY: 'az' }),
      ),
    ).toEqual(['GROQ_API_KEY', 'AZURE_OPENAI_API_KEY']);
  });

  it('covers the cerebras key too', () => {
    expect(mockOverriddenKeys('mock', env({ CEREBRAS_API_KEY: 'csk' }))).toEqual([
      'CEREBRAS_API_KEY',
    ]);
  });

  it('stays quiet when mock is the honest resolution (no key anywhere)', () => {
    expect(mockOverriddenKeys('mock', env({}))).toEqual([]);
    // A blank `KEY=` line is unset, not a configured provider.
    expect(mockOverriddenKeys('mock', env({ GROQ_API_KEY: '  ' }))).toEqual([]);
  });

  it('stays quiet whenever a real provider actually resolved', () => {
    expect(mockOverriddenKeys('groq', env({ GROQ_API_KEY: 'gsk_real' }))).toEqual([]);
  });
});

describe('selectInterviewKind', () => {
  it('follows the one-switch resolution by default', () => {
    expect(selectInterviewKind(undefined, undefined)).toBe('mock');
    expect(selectInterviewKind(undefined, undefined, { groq: 'gsk' })).toBe('groq');
    // One switch: an LLM_PROVIDER force applies to the interview too.
    expect(selectInterviewKind(undefined, 'claude', { groq: 'gsk' })).toBe('claude');
  });

  it('can be pinned independently via INTERVIEW_LLM_PROVIDER', () => {
    expect(selectInterviewKind('groq', 'mock')).toBe('groq');
    expect(selectInterviewKind('mock', undefined, { groq: 'gsk' })).toBe('mock');
    // The interview can stay on mock while the design agents run elsewhere.
    expect(selectInterviewKind('mock', undefined, { azure: 'az_key' })).toBe('mock');
    expect(selectInterviewKind('mock', undefined, { cerebras: 'csk' })).toBe('mock');
  });

  it('threads every auto-selected fallback through to the interview', () => {
    expect(selectInterviewKind(undefined, undefined, { azure: 'az_key' })).toBe('azure');
    expect(selectInterviewKind(undefined, undefined, { siliconflow: 'sf' })).toBe(
      'siliconflow',
    );
    expect(selectInterviewKind(undefined, undefined, { cerebras: 'csk' })).toBe(
      'cerebras',
    );
  });
});
