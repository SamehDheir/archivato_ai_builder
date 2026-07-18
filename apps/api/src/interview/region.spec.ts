import {
  REGIONAL_REGULATIONS,
  regulationsForMarket,
  resolveRegion,
  resolveRegionKey,
} from '@archivato/shared';

describe('resolveRegionKey', () => {
  it.each([
    ['Saudi Arabia', 'mena'],
    ['KSA and UAE', 'mena'],
    ['Dubai, Abu Dhabi', 'mena'],
    ['Egypt', 'mena'],
    ['السعودية', 'mena'],
    ['العملاء في مصر', 'mena'],
    ['United States', 'us'],
    ['US only', 'us'],
    ['Germany and France', 'eu'],
    ['the EU', 'eu'],
    ['worldwide', 'global'],
  ])('classifies %s as %s', (market, expected) => {
    expect(resolveRegionKey(market)).toBe(expected);
  });

  it('returns null rather than guessing', () => {
    expect(resolveRegionKey(undefined)).toBeNull();
    expect(resolveRegionKey(null)).toBeNull();
    expect(resolveRegionKey('')).toBeNull();
    expect(resolveRegionKey('not sure yet')).toBeNull();
    expect(resolveRegionKey('to be confirmed with the client')).toBeNull();
  });
});

describe('regulationsForMarket', () => {
  it('names the regional law for a MENA project, not GDPR', () => {
    const regime = regulationsForMarket('Saudi Arabia');
    expect(regime).not.toBeNull();
    const laws = regime!.laws.join(' ');
    expect(laws).toContain('PDPL');
    expect(laws).not.toContain('GDPR');
    expect(laws).not.toContain('HIPAA');
  });

  it('applies GDPR where it actually applies', () => {
    expect(regulationsForMarket('Germany')!.laws.join(' ')).toContain('GDPR');
  });

  it('qualifies HIPAA rather than asserting it for any US project', () => {
    const laws = regulationsForMarket('United States')!.laws;
    const hipaa = laws.find((l) => l.includes('HIPAA'));
    expect(hipaa).toMatch(/only if/i);
  });

  it('returns null for an unknown market so callers must ask', () => {
    expect(regulationsForMarket('somewhere')).toBeNull();
    expect(regulationsForMarket(undefined)).toBeNull();
  });

  it('covers every region bucket', () => {
    for (const regime of Object.values(REGIONAL_REGULATIONS)) {
      expect(regime.laws.length).toBeGreaterThan(0);
      expect(regime.dataResidency).toBeTruthy();
      expect(regime.note).toBeTruthy();
    }
  });
});

describe('resolveRegion (pricing) shares the compliance classifier', () => {
  it('resolves the same markets the regulation lookup does', () => {
    expect(resolveRegion('Saudi Arabia')).not.toBeNull();
    expect(resolveRegion('Saudi Arabia')!.paymentsFeeNote).toContain('PayTabs');
    expect(resolveRegion('nowhere in particular')).toBeNull();
  });

  it('agrees with resolveRegionKey on every input', () => {
    for (const market of ['Egypt', 'US', 'France', 'global', 'unknown', '']) {
      expect(!!resolveRegion(market)).toBe(!!resolveRegionKey(market));
    }
  });
});
