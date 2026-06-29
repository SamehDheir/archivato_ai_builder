import { selectProviderKind, selectInterviewKind } from './llm.module';

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
  });
});
