/**
 * Target-market classification and the data-protection regime that follows from
 * it. Pure, runtime-free, unit-tested.
 *
 * This exists because the default failure mode of an LLM writing a requirement
 * document is to reach for GDPR and HIPAA regardless of who the software is
 * actually for — they dominate its training data. For this product's market that
 * is not a harmless extra: naming the wrong law makes a scoping document look
 * unserious to the one reader who knows better, and it silently misses the
 * obligation that does apply (a Saudi project answers to the PDPL and its data
 * residency expectations, not to GDPR).
 *
 * So the region is classified in code from the client's own stated market, and
 * the applicable regime is looked up rather than recalled. **An unrecognized or
 * absent market returns `null`, never a default** — the same rule as `parseBudget`
 * and `parseTimelineWeeks`. Downstream turns that null into a stated assumption
 * the client can correct, which is honest; a confident "GDPR applies" is not.
 */

/** The coarse market buckets the pricing and compliance tables are keyed by. */
export const REGION_KEYS = ['mena', 'us', 'eu', 'global'] as const;

export type RegionKey = (typeof REGION_KEYS)[number];

/**
 * Normalize a free-text target market to a bucket, or `null` when it doesn't
 * clearly match one.
 *
 * The single classifier — cost (regional PSP fees) and compliance both key off
 * it, so the two can never disagree about which market a project is in.
 */
export function resolveRegionKey(
  targetMarket: string | undefined | null,
): RegionKey | null {
  if (!targetMarket) return null;
  const t = targetMarket.toLowerCase();
  if (
    /mena|middle east|gulf|gcc|saudi|ksa|emirat|uae|dubai|abu dhabi|qatar|kuwait|bahrain|oman|egypt|jordan|lebanon|iraq|morocco|tunisia|algeria|libya|yemen|arab|السعودية|الإمارات|مصر|الأردن|الخليج|قطر|الكويت|البحرين|عمان|المغرب|تونس/.test(
      t,
    )
  ) {
    return 'mena';
  }
  if (/\bus\b|\busa\b|united states|america|canada|north america/.test(t)) {
    return 'us';
  }
  if (
    /\beu\b|europe|european|\buk\b|britain|germany|france|spain|italy|netherlands|sepa/.test(
      t,
    )
  ) {
    return 'eu';
  }
  if (/global|worldwide|international|multiple|عالمي|دولي/.test(t)) {
    return 'global';
  }
  return null;
}

/** The data-protection regime a market implies. */
export interface RegionalRegulation {
  /** The laws to name in the document — the specific ones, not a category. */
  laws: string[];
  /** Where data is normally expected to live. */
  dataResidency: string;
  /** One line of guidance for the requirement/architecture prompts. */
  note: string;
}

/**
 * Data-protection regimes by market bucket.
 *
 * Deliberately coarse and deliberately non-exhaustive: this is the raw material
 * for a scoping document's compliance line, not legal advice, and the artifacts
 * say so. Sector-specific regimes (health, finance, children) are named where
 * they dominate, because "which law applies" in the US is genuinely a
 * sector question rather than a national one.
 *
 * Extend this table rather than teaching a prompt a new jurisdiction.
 */
export const REGIONAL_REGULATIONS: Record<RegionKey, RegionalRegulation> = {
  mena: {
    laws: [
      'Saudi PDPL (Personal Data Protection Law, enforced by SDAIA)',
      'Jordan Personal Data Protection Law No. 24 of 2023',
      'UAE PDPL (Federal Decree-Law 45/2021)',
      'Egypt Data Protection Law 151/2020',
    ],
    dataResidency:
      'Several Gulf regulators expect personal data to stay in-region, and Saudi health data in particular is expected to remain in-Kingdom; confirm the hosting region with the client before committing to a provider.',
    note: 'Name the specific national law for the country in question — one project rarely spans all of them. GDPR applies only if the client also serves EU residents, and HIPAA is a US statute that does not apply here at all — do not cite either by default.',
  },
  us: {
    laws: [
      'CCPA / CPRA (California)',
      'HIPAA (only if protected health information is handled)',
      'GLBA (only for financial data)',
      "COPPA (only if under-13 users are in scope)",
    ],
    dataResidency:
      'No general federal residency requirement; sector rules and state privacy laws drive the obligations.',
    note: 'There is no single US federal privacy law. Cite the state and sector regimes that actually apply, and cite HIPAA only when clinical data is genuinely in scope.',
  },
  eu: {
    laws: ['GDPR', 'ePrivacy Directive (cookies / tracking)'],
    dataResidency:
      'Personal data stays in the EU/EEA unless a lawful transfer mechanism is in place.',
    note: 'GDPR applies here by default. Cover the lawful basis, data-subject rights, and retention explicitly.',
  },
  global: {
    laws: [
      'The regime of each market served (GDPR for EU residents, national laws elsewhere)',
    ],
    dataResidency:
      'Residency obligations vary per market and must be confirmed per launch country.',
    note: 'Serving several markets means several regimes. Name the launch markets rather than listing every law in the world.',
  },
};

/**
 * The regime for a stated market, or `null` when the market is unknown or
 * unrecognized. Callers must treat `null` as "ask the client", never as a cue to
 * fall back on a familiar law.
 */
export function regulationsForMarket(
  targetMarket: string | undefined | null,
): RegionalRegulation | null {
  const key = resolveRegionKey(targetMarket);
  return key ? REGIONAL_REGULATIONS[key] : null;
}
