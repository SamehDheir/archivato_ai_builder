import {
  EMPTY_LLM_USAGE,
  estimateLlmCostUsd,
  normalizeUsageStage,
  pricingFor,
  totalTokens,
  type LlmUsage,
} from '@archivato/shared';

const usage = (over: Partial<LlmUsage> = {}): LlmUsage => ({
  ...EMPTY_LLM_USAGE,
  ...over,
});

describe('LLM pricing (deterministic)', () => {
  it('prices a plain call off the model catalog', () => {
    // Sonnet 4.6: $3 / 1M in, $15 / 1M out.
    const cost = estimateLlmCostUsd(
      'claude-sonnet-4-6',
      usage({ promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    );
    expect(cost).toBe(18);
  });

  it('discounts cached prompt tokens and surcharges cache writes', () => {
    // 1M prompt tokens, all served from cache: 0.1x the input rate.
    const cached = estimateLlmCostUsd(
      'claude-sonnet-4-6',
      usage({ promptTokens: 1_000_000, cachedPromptTokens: 1_000_000 }),
    );
    expect(cached).toBeCloseTo(0.3, 6);

    // 1M prompt tokens, all written to cache: 1.25x.
    const written = estimateLlmCostUsd(
      'claude-sonnet-4-6',
      usage({ promptTokens: 1_000_000, cacheWritePromptTokens: 1_000_000 }),
    );
    expect(written).toBeCloseTo(3.75, 6);
  });

  it('never double-counts cache tokens (they are part of the prompt total)', () => {
    // Half the prompt was a cache read, so only half bills at the full rate.
    const cost = estimateLlmCostUsd(
      'claude-sonnet-4-6',
      usage({ promptTokens: 1_000_000, cachedPromptTokens: 500_000 }),
    );
    // 500k full ($1.50) + 500k at 0.1x ($0.15)
    expect(cost).toBeCloseTo(1.65, 6);
  });

  it('returns null for a model with no price — an unknown model is NOT free', () => {
    expect(estimateLlmCostUsd('some-new-model', usage({ promptTokens: 500 }))).toBeNull();
    expect(estimateLlmCostUsd('mock', usage())).toBeNull();
  });

  it('prices a dated snapshot id off its base model (longest-prefix match)', () => {
    expect(pricingFor('claude-sonnet-4-6-20250101')).toEqual(
      pricingFor('claude-sonnet-4-6'),
    );
    // The longer key wins over a shorter one that also prefixes it.
    expect(pricingFor('gpt-4o-mini')?.inputPerMTok).toBe(0.15);
    expect(pricingFor('gpt-4o')?.inputPerMTok).toBe(2.5);
  });

  it('is deterministic and case-insensitive', () => {
    const u = usage({ promptTokens: 1234, completionTokens: 567 });
    const a = estimateLlmCostUsd('CLAUDE-OPUS-4-8', u);
    const b = estimateLlmCostUsd('claude-opus-4-8', u);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it('sums prompt + completion tokens', () => {
    expect(totalTokens(usage({ promptTokens: 10, completionTokens: 5 }))).toBe(15);
  });
});

describe('normalizeUsageStage', () => {
  it('maps a known route segment onto its stage', () => {
    expect(normalizeUsageStage('system-design')).toBe('system-design');
    expect(normalizeUsageStage('SUPPORT')).toBe('support');
  });

  it('falls back to `other` for anything unrecognized', () => {
    expect(normalizeUsageStage('scaffold')).toBe('other');
    expect(normalizeUsageStage(undefined)).toBe('other');
    expect(normalizeUsageStage('')).toBe('other');
  });
});
