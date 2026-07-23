/**
 * The Cost Estimate — output of the Cost Estimator stage. A standalone artifact
 * derived from the generated design (system + database + API): it projects a
 * ballpark **monthly** hosting bill across popular providers at three user
 * scales (100 / 1,000 / 10,000).
 *
 * Numbers are produced by a **deterministic** model (`estimateCosts`) from public
 * ballpark list prices — never an LLM — so they're stable and testable. They are
 * planning estimates, not quotes.
 */

import type { DerivedArtifact } from './freshness';
import type { BudgetWarning, EffortEstimate } from './effort';
import type { BuildVsBuyCapability, SystemDesign } from './system-design';
import { resolveRegionKey, type RegionKey } from './region';
import {
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
} from './artifact-language';
import {
  providerFit,
  providerRationale,
  reconcileHosting,
  type CostProjectProfile,
  type HostingRecommendation,
  type ProviderFit,
} from './cost-estimate.hosting';

/** The user scales we project a monthly bill at. */
export const COST_USER_SCALES = [100, 1000, 10000] as const;

export type CostUserScale = (typeof COST_USER_SCALES)[number];

/**
 * Providers we estimate.
 *
 * **Azure and Google Cloud were the two gaps that produced a real bug.** A
 * project whose System Design chose *Azure App Service (Linux) – Jordan region*
 * hit a table containing neither, so the chosen host silently vanished from the
 * comparison and the estimate crowned Fly.io "best value" — while asserting that
 * the design had named no host. Listing AWS but not the other two members of the
 * global top three was never defensible; a table that omits a provider does not
 * get to conclude the provider was not chosen.
 *
 * `vps` is the generic self-managed box (Hetzner, a local datacentre VPS, bare
 * metal) — a genuinely common answer in this product's market and, until now,
 * one the estimator could not represent at all. It carries a permanent
 * `fit.caveat` because its bill excludes the operations labour every managed
 * provider here includes.
 *
 * The list is still not the world, and it never will be — which is exactly why
 * `HostingChoice` distinguishes "named a host we do not price" from "named no
 * host". Adding a provider here narrows the unpriced case; it does not close it.
 */
export type CostProviderId =
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'digitalocean'
  | 'railway'
  | 'render'
  | 'vercel'
  | 'cloudflare'
  | 'flyio'
  | 'heroku'
  | 'vps';

/** Hosting model — drives how compute is priced (instances vs. per-request). */
export type CostHostingModel = 'iaas' | 'paas' | 'serverless';

/** A single cost category within a provider's monthly bill. */
export type CostCategory =
  | 'compute'
  | 'database'
  | 'bandwidth'
  | 'storage'
  | 'platform';

export interface CostLineItem {
  category: CostCategory;
  /** Human resource description, e.g. "2× shared-CPU instance". */
  label: string;
  monthlyUsd: number;
}

export interface CostAtScale {
  users: number;
  /** Rounded monthly total (USD). */
  monthlyUsd: number;
  lineItems: CostLineItem[];
}

export interface ProviderEstimate {
  provider: CostProviderId;
  /** Display name, e.g. "Amazon Web Services". */
  name: string;
  model: CostHostingModel;
  /** One-line positioning. Genuinely static — what the platform *is*. */
  summary: string;
  /**
   * @deprecated Static marketing copy; superseded by `rationale`.
   *
   * It claimed to describe "where this provider shines for this workload" and
   * never read the workload — a 1,000-user MVP was told Cloudflare suits
   * "edge-first apps and heavy traffic". Still emitted so estimates stored
   * before `rationale` existed keep rendering; every consumer should prefer
   * `rationale` and fall back to this.
   */
  bestFor: string;
  /**
   * Why this provider, for THIS project, from its own computed numbers
   * (cost position at each scale, the category actually carrying the bill,
   * external-DB and feasibility caveats). Optional/additive — absent on
   * estimates stored before this existed.
   */
  rationale?: string;
  /** Whether this provider can actually run the design (additive/optional). */
  fit?: ProviderFit;
  /** true when the provider has no first-class managed DB (an external one is priced in). */
  externalDbNeeded: boolean;
  /** One entry per scale in `COST_USER_SCALES` order. */
  costs: CostAtScale[];
}

/** The workload the estimate was derived from (shown for transparency). */
export interface CostWorkload {
  services: number;
  entities: number;
  endpoints: number;
  databaseType: string;
  architecture: string;
}

export interface CostEstimate extends DerivedArtifact {
  sessionId: string;
  generatedAt: string;
  workload: CostWorkload;
  /** The projected scales (mirrors COST_USER_SCALES). */
  scales: number[];
  providers: ProviderEstimate[];
  /** Cheapest provider id at each scale, keyed by the scale as a string. */
  cheapestByScale: Record<string, CostProviderId>;
  /**
   * Best overall value (lowest summed cost across all scales).
   *
   * Kept for back-compat and still purely arithmetic — it takes no account of
   * whether the provider can host the design. **Prefer `hosting.provider`**,
   * which is reconciled with the System Design and excludes infeasible hosts.
   */
  recommended: CostProviderId;
  /**
   * The headline hosting recommendation, reconciled with the host the System
   * Design already chose. Optional/additive — absent on estimates stored before
   * this existed, in which case consumers fall back to `recommended`.
   */
  hosting?: HostingRecommendation;
  disclaimer: string;
  /**
   * Person-effort estimate (R9). Additive/optional — absent on pre-R9 stored
   * estimates, so every consumer must tolerate its absence.
   */
  effort?: EffortEstimate;
  /** Third-party SaaS subscription lines implied by build-vs-buy (R9). */
  serviceSubscriptions?: ServiceCostLine[];
  /**
   * OWNER-ONLY budget reality check (R9). **Must be stripped from the public
   * share payload server-side** — a deal risk is not for the client's eyes.
   */
  budgetWarning?: BudgetWarning | null;
}

// --- Service subscriptions + regional payment fees (R9) ---------------------

/** How a service line's monthly figure is expressed. */
export type ServiceCostBasis = 'flat' | 'usage-based' | 'unknown';

/** A third-party SaaS line implied by a build-vs-buy "buy" recommendation. */
export interface ServiceCostLine {
  capability: BuildVsBuyCapability;
  label: string;
  /** Typical entry-tier monthly USD, or null when usage-based / unknown. */
  monthlyUsd: number | null;
  basis: ServiceCostBasis;
  /** The concrete service suggested by build-vs-buy (e.g. "Stripe"). */
  suggestedService?: string;
  /** Regional payment-processing fee note (payments, when the market is known). */
  feeNote?: string;
}

/**
 * Static per-capability cost hints for bought services. `monthlyUsd: null` +
 * `usage-based` renders as "usage-based", never a misleading $0 — the same
 * "unknown price → unknown cost" convention as the LLM metering.
 */
export const SERVICE_COST_HINTS: Record<
  BuildVsBuyCapability,
  { label: string; monthlyUsd: number | null; basis: ServiceCostBasis }
> = {
  auth: { label: 'Managed authentication', monthlyUsd: null, basis: 'usage-based' },
  payments: { label: 'Payment processing', monthlyUsd: null, basis: 'usage-based' },
  notifications: {
    label: 'Email / SMS / push delivery',
    monthlyUsd: null,
    basis: 'usage-based',
  },
  file_storage: { label: 'Object storage & CDN', monthlyUsd: null, basis: 'usage-based' },
  maps_geo: { label: 'Maps & geocoding API', monthlyUsd: null, basis: 'usage-based' },
  search: { label: 'Hosted search', monthlyUsd: 29, basis: 'flat' },
};

/**
 * Regional payment-processing fee bands (market-generic notes, not exact math).
 * Keyed by the shared market buckets, so pricing and compliance can never
 * disagree about which region a project is in.
 */
export const REGIONAL_SERVICES: Record<
  RegionKey,
  { paymentsFeeNote: string; approxFeePct: number }
> = {
  mena: {
    paymentsFeeNote:
      'Regional PSPs (e.g. PayTabs, Tap) typically charge ~2.5–3% per transaction.',
    approxFeePct: 2.75,
  },
  us: {
    paymentsFeeNote: 'US card processing is ~2.9% + $0.30 per transaction.',
    approxFeePct: 2.9,
  },
  eu: {
    paymentsFeeNote: 'EU/SEPA card processing is ~1.5–2.5% per transaction.',
    approxFeePct: 2.0,
  },
  global: {
    paymentsFeeNote: 'International card processing is ~2.9–3.9% per transaction.',
    approxFeePct: 3.4,
  },
};

/**
 * The payment-fee band for a free-text target market, or null when it doesn't
 * resolve. Classification itself lives in `region.ts` — one classifier shared
 * with the compliance lookup.
 */
export function resolveRegion(
  targetMarket: string | undefined | null,
): { paymentsFeeNote: string; approxFeePct: number } | null {
  const key = resolveRegionKey(targetMarket);
  return key ? REGIONAL_SERVICES[key] : null;
}

/**
 * The monthly SaaS subscription lines a design implies — one per build-vs-buy
 * "buy" recommendation. Deterministic. When the target market is known, the
 * payments line carries a regional fee note.
 */
export function buildServiceCostLines(
  design: Pick<SystemDesign, 'buildVsBuy'>,
  options?: { targetMarket?: string },
): ServiceCostLine[] {
  const region = resolveRegion(options?.targetMarket);
  const lines: ServiceCostLine[] = [];
  for (const item of design.buildVsBuy ?? []) {
    if (item.recommendation !== 'buy') continue;
    const hint = SERVICE_COST_HINTS[item.capability];
    const line: ServiceCostLine = hint
      ? {
          capability: item.capability,
          label: hint.label,
          monthlyUsd: hint.monthlyUsd,
          basis: hint.basis,
          suggestedService: item.suggestedService,
        }
      : {
          capability: item.capability,
          label: item.capability,
          monthlyUsd: null,
          basis: 'unknown',
          suggestedService: item.suggestedService,
        };
    if (item.capability === 'payments' && region) {
      line.feeNote = region.paymentsFeeNote;
    }
    lines.push(line);
  }
  return lines;
}

/** The design-derived inputs the estimator needs. */
export interface CostEstimateInput extends CostWorkload {
  sessionId: string;
  /**
   * The project facts the reasoning is written from. Optional — with no profile
   * the estimate still prices everything and simply reasons from the computed
   * bill alone, which is what every caller did before this existed.
   */
  profile?: CostProjectProfile;
  /** Language for the generated reasoning. Defaults to English. */
  language?: ArtifactLanguage;
}

// --- Pricing model -----------------------------------------------------------

/**
 * Per-provider ballpark list prices (USD). Approximate and rounded — meant for
 * relative comparison and order-of-magnitude planning, not billing accuracy.
 */
interface ProviderPricing {
  id: CostProviderId;
  name: string;
  model: CostHostingModel;
  summary: string;
  bestFor: string;
  /** $/mo per compute "unit" (a ~1 vCPU / 1–2 GB instance). IaaS/PaaS only. */
  computePerUnit: number;
  /** Serverless: $/mo platform floor + $ per 1M requests (compute is per-request). */
  serverless?: { requestsFreeMillions: number; perMillion: number };
  /** Managed DB monthly floor. */
  dbBase: number;
  /** Extra $/mo of DB storage per GB above the (small) included allowance. */
  dbPerGb: number;
  /** Extra $/mo of DB capacity per 1,000 users (vertical scaling). */
  dbScalePerThousandUsers: number;
  /** Egress price per GB and the monthly free allowance. */
  bandwidthPerGb: number;
  bandwidthFreeGb: number;
  /** Fixed monthly platform/seat fee. */
  platformFee: number;
  /** No first-class DB → the `dbBase` models an external managed Postgres. */
  externalDbNeeded?: boolean;
}

const PRICING: ProviderPricing[] = [
  {
    id: 'aws',
    name: 'Amazon Web Services',
    model: 'iaas',
    summary: 'Most flexible; scales the furthest, at the cost of complexity.',
    bestFor: 'Teams that need fine-grained control and room to grow.',
    computePerUnit: 18,
    dbBase: 28,
    dbPerGb: 0.14,
    dbScalePerThousandUsers: 6,
    bandwidthPerGb: 0.09,
    bandwidthFreeGb: 100,
    platformFee: 0,
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    model: 'iaas',
    summary:
      'Full cloud with managed App Service and Postgres; the usual pick when a client is already on Microsoft or needs a specific region.',
    bestFor: 'Enterprise and regulated work, and deployments pinned to a region.',
    computePerUnit: 16,
    dbBase: 26,
    dbPerGb: 0.12,
    dbScalePerThousandUsers: 6,
    bandwidthPerGb: 0.087,
    bandwidthFreeGb: 100,
    platformFee: 0,
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    model: 'iaas',
    summary: 'Full cloud with strong managed data services; priced close to AWS.',
    bestFor: 'Data-heavy products and teams already using Google services.',
    computePerUnit: 15,
    dbBase: 25,
    dbPerGb: 0.17,
    dbScalePerThousandUsers: 6,
    bandwidthPerGb: 0.12,
    bandwidthFreeGb: 100,
    platformFee: 0,
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    model: 'iaas',
    summary: 'Predictable droplet + managed-DB pricing with generous egress.',
    bestFor: 'Simple, cost-stable hosting from small to mid scale.',
    computePerUnit: 12,
    dbBase: 15,
    dbPerGb: 0.1,
    dbScalePerThousandUsers: 5,
    bandwidthPerGb: 0.01,
    bandwidthFreeGb: 1000,
    platformFee: 0,
  },
  {
    id: 'railway',
    name: 'Railway',
    model: 'paas',
    summary: 'Usage-based PaaS; near-zero setup, deploys straight from git.',
    bestFor: 'Shipping fast at small scale with minimal ops.',
    computePerUnit: 10,
    dbBase: 10,
    dbPerGb: 0.25,
    dbScalePerThousandUsers: 7,
    bandwidthPerGb: 0.1,
    bandwidthFreeGb: 0,
    platformFee: 5,
  },
  {
    id: 'render',
    name: 'Render',
    model: 'paas',
    summary: 'Managed services + Postgres with a clean developer experience.',
    bestFor: 'A Heroku-like flow without the Heroku price.',
    computePerUnit: 8,
    dbBase: 7,
    dbPerGb: 0.3,
    dbScalePerThousandUsers: 10,
    bandwidthPerGb: 0.1,
    bandwidthFreeGb: 100,
    platformFee: 0,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    model: 'serverless',
    summary: 'Best-in-class frontend/serverless; bandwidth gets pricey at scale.',
    bestFor: 'Next.js frontends; pair with an external managed database.',
    computePerUnit: 0,
    serverless: { requestsFreeMillions: 1, perMillion: 2 },
    dbBase: 19,
    dbPerGb: 0.1,
    dbScalePerThousandUsers: 4,
    bandwidthPerGb: 0.15,
    bandwidthFreeGb: 100,
    platformFee: 20,
    externalDbNeeded: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    model: 'serverless',
    summary: 'Workers + D1 with free egress — cheapest bandwidth by far.',
    bestFor: 'Edge-first apps and heavy traffic on a tight budget.',
    computePerUnit: 0,
    serverless: { requestsFreeMillions: 10, perMillion: 0.3 },
    dbBase: 5,
    dbPerGb: 0.75,
    dbScalePerThousandUsers: 2,
    bandwidthPerGb: 0,
    bandwidthFreeGb: 0,
    platformFee: 5,
  },
  {
    id: 'flyio',
    name: 'Fly.io',
    model: 'paas',
    summary: 'Run containers close to users; cheap shared-CPU machines.',
    bestFor: 'Global low-latency apps at a low baseline cost.',
    computePerUnit: 6,
    dbBase: 12,
    dbPerGb: 0.15,
    dbScalePerThousandUsers: 5,
    bandwidthPerGb: 0.02,
    bandwidthFreeGb: 100,
    platformFee: 0,
  },
  {
    id: 'heroku',
    name: 'Heroku',
    model: 'paas',
    summary: 'Mature PaaS with the simplest ops — priced at a premium.',
    bestFor: 'Prototypes and teams that value simplicity over cost.',
    computePerUnit: 25,
    dbBase: 9,
    dbPerGb: 0,
    dbScalePerThousandUsers: 20,
    bandwidthPerGb: 0,
    bandwidthFreeGb: 0,
    platformFee: 0,
  },
  {
    id: 'vps',
    name: 'Self-managed VPS',
    model: 'iaas',
    summary:
      'Rented servers you administer yourself (Hetzner, a local datacentre, bare metal). Cheapest on paper; the operations work is yours.',
    bestFor: 'Teams with ops capacity, or a client who requires local hardware.',
    computePerUnit: 7,
    // Postgres runs on your own machine, so this is the incremental cost of the
    // box and disk it needs — not a managed-database subscription.
    dbBase: 6,
    dbPerGb: 0.05,
    dbScalePerThousandUsers: 3,
    bandwidthPerGb: 0.01,
    bandwidthFreeGb: 5000,
    platformFee: 0,
  },
];

/** Round to the nearest dollar (bills are whole-dollar planning figures). */
function round(n: number): number {
  return Math.max(0, Math.round(n));
}

/**
 * Compute "units" (≈1 vCPU instances) a non-serverless deploy needs at a scale.
 * Grows with users, with a bump for microservices (more moving parts to run).
 */
function computeUnits(users: number, architecture: string, services: number): number {
  let base = users <= 100 ? 1 : users <= 1000 ? 2 : 4;
  if (architecture === 'microservices') {
    base = Math.min(base + Math.min(Math.max(services, 1), 4), 8);
  }
  return base;
}

/** Design-independent monthly traffic/storage the workload implies at a scale. */
function scaleMetrics(users: number, entities: number) {
  // ~30 actions/user/day over 30 days.
  const requestsPerMonth = users * 30 * 30;
  // ~60 KB average response → egress in GB (KB → GB).
  const bandwidthGb = (requestsPerMonth * 60) / 1_048_576;
  // Storage grows with data model breadth and audience.
  const dbStorageGb = Math.max(1, Math.ceil((entities * users) / 3000));
  return { requestsPerMonth, bandwidthGb, dbStorageGb };
}

/** Build one provider's bill at one scale. */
function providerCostAtScale(
  p: ProviderPricing,
  users: number,
  workload: CostWorkload,
): CostAtScale {
  const { requestsPerMonth, bandwidthGb, dbStorageGb } = scaleMetrics(
    users,
    workload.entities,
  );
  const lineItems: CostLineItem[] = [];

  // Compute.
  if (p.serverless) {
    const billableM = Math.max(
      0,
      requestsPerMonth / 1_000_000 - p.serverless.requestsFreeMillions,
    );
    lineItems.push({
      category: 'compute',
      label: `Serverless — ${(requestsPerMonth / 1_000_000).toFixed(1)}M requests/mo`,
      monthlyUsd: billableM * p.serverless.perMillion,
    });
  } else {
    const units = computeUnits(users, workload.architecture, workload.services);
    lineItems.push({
      category: 'compute',
      label: `${units}× compute instance`,
      monthlyUsd: units * p.computePerUnit,
    });
  }

  // Database (managed; external where the provider has none).
  const dbScale = (users / 1000) * p.dbScalePerThousandUsers;
  const dbStorage = dbStorageGb * p.dbPerGb;
  lineItems.push({
    category: 'database',
    label: p.externalDbNeeded
      ? `External managed ${workload.databaseType} (${dbStorageGb} GB)`
      : `Managed ${workload.databaseType} (${dbStorageGb} GB)`,
    monthlyUsd: p.dbBase + dbScale + dbStorage,
  });

  // Bandwidth (egress).
  const billableGb = Math.max(0, bandwidthGb - p.bandwidthFreeGb);
  lineItems.push({
    category: 'bandwidth',
    label: `${Math.round(bandwidthGb)} GB egress${
      p.bandwidthPerGb === 0 ? ' (free)' : ''
    }`,
    monthlyUsd: billableGb * p.bandwidthPerGb,
  });

  // Fixed platform / seat fee.
  if (p.platformFee > 0) {
    lineItems.push({
      category: 'platform',
      label: 'Platform / seat fee',
      monthlyUsd: p.platformFee,
    });
  }

  const rounded = lineItems.map((li) => ({ ...li, monthlyUsd: round(li.monthlyUsd) }));
  const monthlyUsd = round(rounded.reduce((s, li) => s + li.monthlyUsd, 0));
  return { users, monthlyUsd, lineItems: rounded };
}

/**
 * Deterministically estimate the monthly hosting bill for a design across every
 * provider and scale. Pure function (no I/O, no randomness) so it's identical on
 * every run and unit-testable.
 */
/** Every provider we price — the source for validating a provider id. */
export const COST_PROVIDER_IDS: readonly CostProviderId[] = [
  'aws',
  'azure',
  'gcp',
  'digitalocean',
  'railway',
  'render',
  'vercel',
  'cloudflare',
  'flyio',
  'heroku',
  'vps',
];

/** Display name for a provider id (falls back to the id itself). */
export function costProviderName(id: CostProviderId): string {
  return PRICING.find((p) => p.id === id)?.name ?? id;
}

export function estimateCosts(
  input: CostEstimateInput,
): Omit<CostEstimate, 'sessionId' | 'generatedAt'> {
  const workload: CostWorkload = {
    services: input.services,
    entities: input.entities,
    endpoints: input.endpoints,
    databaseType: input.databaseType || 'PostgreSQL',
    architecture: input.architecture || 'modular_monolith',
  };

  const profile = input.profile ?? {};
  const language = input.language ?? DEFAULT_ARTIFACT_LANGUAGE;
  const runtime = profile.runtime ?? 'unknown';

  const priced = PRICING.map((p) => ({
    pricing: p,
    costs: COST_USER_SCALES.map((users) => providerCostAtScale(p, users, workload)),
    fit: providerFit(p.id, p.model, runtime, language),
  }));

  // The comparison scale — the middle of the three. The headline reasoning has
  // to speak about ONE bill, and the mid scale is the one a project is actually
  // sized for: the low scale flatters providers with a free tier that runs out,
  // and the high scale describes a future the client has not reached.
  const compareIndex = Math.floor(COST_USER_SCALES.length / 2);
  const cheapestAtCompare = priced
    .filter((p) => p.fit.viable)
    .reduce(
      (best, p) =>
        !best || p.costs[compareIndex].monthlyUsd < best.costs[compareIndex].monthlyUsd
          ? p
          : best,
      null as (typeof priced)[number] | null,
    );

  const providers: ProviderEstimate[] = priced.map((p) => ({
    provider: p.pricing.id,
    name: p.pricing.name,
    model: p.pricing.model,
    summary: p.pricing.summary,
    // Still emitted so a consumer reading a mix of old and new estimates has one
    // field that is always present; `rationale` is what should be shown.
    bestFor: p.pricing.bestFor,
    rationale: providerRationale({
      monthlyUsd: p.costs[compareIndex].monthlyUsd,
      cheapestMonthlyUsd:
        cheapestAtCompare?.costs[compareIndex].monthlyUsd ??
        p.costs[compareIndex].monthlyUsd,
      cost: p.costs[compareIndex],
      fit: p.fit,
      externalDbNeeded: !!p.pricing.externalDbNeeded,
      profile,
      language,
    }),
    fit: p.fit,
    externalDbNeeded: !!p.pricing.externalDbNeeded,
    costs: p.costs,
  }));

  // Cheapest provider at each scale.
  const cheapestByScale: Record<string, CostProviderId> = {};
  COST_USER_SCALES.forEach((users, i) => {
    let best = providers[0];
    for (const prov of providers) {
      if (prov.costs[i].monthlyUsd < best.costs[i].monthlyUsd) best = prov;
    }
    cheapestByScale[String(users)] = best.provider;
  });

  // Best overall value = lowest summed monthly cost across all scales. Retained
  // unchanged for back-compat; `hosting` below is the reconciled answer.
  let recommended = providers[0];
  const total = (pe: ProviderEstimate) =>
    pe.costs.reduce((s, c) => s + c.monthlyUsd, 0);
  for (const prov of providers) {
    if (total(prov) < total(recommended)) recommended = prov;
  }

  const hosting = reconcileHosting({
    candidates: providers.map((p) => ({
      provider: p.provider,
      name: p.name,
      monthlyUsd: p.costs[compareIndex].monthlyUsd,
      fit: p.fit ?? { viable: true },
    })),
    chosen: profile.chosenHosting,
    constraint: profile.hostingConstraint,
    language,
  });

  return {
    workload,
    scales: [...COST_USER_SCALES],
    providers,
    cheapestByScale,
    recommended: recommended.provider,
    ...(hosting ? { hosting } : {}),
    disclaimer:
      'Ballpark estimates from public list prices for planning only — not quotes. ' +
      'Actual costs vary with usage patterns, region, reserved/committed discounts, and free tiers.',
  };
}
