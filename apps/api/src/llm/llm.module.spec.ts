import {
  mockOverriddenKeys,
  selectProviderKind,
  selectInterviewKind,
} from './llm.module';

describe('selectProviderKind (one-switch resolution)', () => {
  it('defaults to mock with no key and no override', () => {
    expect(selectProviderKind(undefined, undefined)).toBe('mock');
    expect(selectProviderKind('', '')).toBe('mock');
  });

  it('flips every agent to groq when GROQ_API_KEY is set', () => {
    expect(selectProviderKind(undefined, 'gsk_real_key')).toBe('groq');
  });

  it('lets LLM_PROVIDER force a specific provider over the key', () => {
    expect(selectProviderKind('mock', 'gsk_real_key')).toBe('mock');
    expect(selectProviderKind('claude', 'gsk_real_key')).toBe('claude');
  });

  it('treats a blank LLM_PROVIDER as unset', () => {
    expect(selectProviderKind('  ', 'gsk_real_key')).toBe('groq');
  });

  it('falls back to azure when only AZURE_OPENAI_API_KEY is set', () => {
    expect(selectProviderKind(undefined, undefined, 'az_key')).toBe('azure');
    expect(selectProviderKind(undefined, '', 'az_key')).toBe('azure');
  });

  it('keeps groq ahead of azure when both keys are present', () => {
    expect(selectProviderKind(undefined, 'gsk_real_key', 'az_key')).toBe('groq');
  });

  it('lets LLM_PROVIDER=azure force azure over a groq key', () => {
    expect(selectProviderKind('azure', 'gsk_real_key', 'az_key')).toBe('azure');
  });

  it('falls back to siliconflow when only SILICONFLOW_API_KEY is set', () => {
    expect(selectProviderKind(undefined, undefined, undefined, 'sf_key')).toBe(
      'siliconflow',
    );
  });

  // Adding a key must never move an existing install off its current provider.
  it('keeps groq and azure ahead of siliconflow', () => {
    expect(selectProviderKind(undefined, 'gsk_real_key', undefined, 'sf_key')).toBe(
      'groq',
    );
    expect(selectProviderKind(undefined, undefined, 'az_key', 'sf_key')).toBe('azure');
  });

  it('lets LLM_PROVIDER=siliconflow force it over the other keys', () => {
    expect(
      selectProviderKind('siliconflow', 'gsk_real_key', 'az_key', 'sf_key'),
    ).toBe('siliconflow');
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
    expect(selectInterviewKind(undefined, undefined, undefined)).toBe('mock');
    expect(selectInterviewKind(undefined, undefined, 'gsk')).toBe('groq');
    // One switch: an LLM_PROVIDER force applies to the interview too.
    expect(selectInterviewKind(undefined, 'claude', 'gsk')).toBe('claude');
  });

  it('can be pinned independently via INTERVIEW_LLM_PROVIDER', () => {
    expect(selectInterviewKind('groq', 'mock', undefined)).toBe('groq');
    expect(selectInterviewKind('mock', undefined, 'gsk')).toBe('mock');
    // The interview can stay on mock while the design agents run on Azure.
    expect(selectInterviewKind('mock', undefined, undefined, 'az_key')).toBe('mock');
  });

  it('threads the azure fallback through to the interview', () => {
    expect(selectInterviewKind(undefined, undefined, undefined, 'az_key')).toBe(
      'azure',
    );
  });

  it('threads the siliconflow fallback through to the interview', () => {
    expect(
      selectInterviewKind(undefined, undefined, undefined, undefined, 'sf_key'),
    ).toBe('siliconflow');
  });
});
