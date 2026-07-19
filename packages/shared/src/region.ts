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
  // Palestine, Syria, Sudan and the rest of the second line were **missing**, and
  // an unrecognized market returns null — which silently switched off three
  // separate features for a client who had answered the question: no compliance
  // regime was named (the document instead asked them to confirm the market they
  // had just stated), no regional payment-fee note reached the cost estimate, and
  // the architect got no data-residency line. Adding a country here is not
  // cosmetic; it is what turns those three back on.
  if (
    /mena|middle east|gulf|gcc|saudi|ksa|emirat|uae|dubai|abu dhabi|qatar|kuwait|bahrain|oman|egypt|jordan|lebanon|iraq|morocco|tunisia|algeria|libya|yemen|arab/.test(
      t,
    ) ||
    /palestin|gaza|west bank|ramallah|hebron|nablus|syria|sudan|mauritania|djibouti|somalia/.test(
      t,
    ) ||
    /السعودية|الإمارات|مصر|الأردن|الخليج|قطر|الكويت|البحرين|عمان|المغرب|تونس|فلسطين|غزة|الضفة|سوريا|السودان|موريتانيا|جيبوتي|الصومال|الجزائر|ليبيا|اليمن|لبنان|العراق/.test(
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

// ── payment-provider availability ────────────────────────────────────────────

/**
 * Payment processors that commonly serve each market bucket — prompt material,
 * so the architect has a regionally plausible name to reach for instead of
 * defaulting to the one that dominates its training data.
 */
export const REGIONAL_PAYMENT_PROVIDERS: Record<RegionKey, string[]> = {
  mena: ['PayTabs', 'Tap Payments', 'MyFatoorah', 'Telr', 'HyperPay'],
  us: ['Stripe', 'Braintree', 'Adyen'],
  eu: ['Stripe', 'Adyen', 'Mollie'],
  global: ['Adyen', 'Checkout.com', 'Stripe'],
};

/** Payment providers that do not onboard merchants based in a given market. */
export interface PaymentAvailability {
  /** Providers a merchant based there cannot sign up for. */
  unavailable: string[];
  /** Regionally viable processors to recommend instead. */
  alternatives: string[];
  /** One line for the prompt and for the artifact's rationale. */
  note: string;
}

/**
 * Markets where a well-known processor cannot be used by a merchant based there.
 *
 * **Country-level, deliberately — NOT keyed by `RegionKey`.** Stripe onboards
 * merchants in the UAE and Saudi Arabia but not in Palestine, so a table keyed by
 * the `mena` bucket would be wrong in both directions: it would either clear
 * Stripe for a Gaza merchant or ban it for a Dubai one. Availability is a
 * country fact; the region bucket is too coarse to carry it.
 *
 * **Deliberately short.** Every row is a factual claim about a real company in a
 * real place, printed in a document a client reads — so this lists only markets
 * where non-support is well established, and an unmatched market yields `null`
 * (the `parseBudget` rule) rather than an assurance that a provider *is*
 * available. Saying nothing is the honest default; the prompt still instructs the
 * model to verify, and every note asks the client to confirm.
 */
const PAYMENT_AVAILABILITY: Array<{ match: RegExp; value: PaymentAvailability }> = [
  {
    match: /palestin|gaza|west bank|ramallah|hebron|nablus|فلسطين|غزة|الضفة/,
    value: {
      unavailable: ['Stripe', 'PayPal'],
      alternatives: [
        'a local payment gateway (e.g. PalPay, Madfoatcom, or a bank-provided gateway)',
        'cash on delivery',
      ],
      note: 'Stripe and PayPal do not onboard merchants based in Palestine. Cash on delivery is the dominant method; card acceptance normally runs through a local bank gateway. Confirm the merchant account route with the client before pricing it.',
    },
  },
  {
    match: /\bsyria|سوريا|\bsudan|السودان|\byemen\b|اليمن|\biran|\bnorth korea|\bcuba\b/,
    value: {
      unavailable: ['Stripe', 'PayPal'],
      alternatives: ['a local bank payment gateway', 'cash on delivery'],
      note: 'Major international processors do not onboard merchants based in this market. Treat the payment route as an open question for the client rather than an assumption.',
    },
  },
];

/**
 * Payment guidance for a stated market, or `null` when nothing is known.
 *
 * `null` means "we have no specific knowledge", never "everything is available".
 */
export function paymentAvailabilityFor(
  targetMarket: string | undefined | null,
): PaymentAvailability | null {
  if (!targetMarket) return null;
  const t = targetMarket.toLowerCase();
  return PAYMENT_AVAILABILITY.find((row) => row.match.test(t))?.value ?? null;
}

/** The processors worth naming for a stated market, minus any it cannot use. */
export function paymentProvidersFor(
  targetMarket: string | undefined | null,
): string[] {
  const key = resolveRegionKey(targetMarket);
  const availability = paymentAvailabilityFor(targetMarket);
  const base = key ? REGIONAL_PAYMENT_PROVIDERS[key] : [];
  const blocked = new Set((availability?.unavailable ?? []).map((s) => s.toLowerCase()));
  const viable = base.filter((p) => !blocked.has(p.toLowerCase()));
  return [...viable, ...(availability?.alternatives ?? [])];
}
