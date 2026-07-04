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

/** The user scales we project a monthly bill at. */
export const COST_USER_SCALES = [100, 1000, 10000] as const;
export type CostUserScale = (typeof COST_USER_SCALES)[number];

/** Providers we estimate. `etc.` is covered by the breadth of these eight. */
export type CostProviderId =
  | 'aws'
  | 'digitalocean'
  | 'railway'
  | 'render'
  | 'vercel'
  | 'cloudflare'
  | 'flyio'
  | 'heroku';

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
  /** One-line positioning. */
  summary: string;
  /** Where this provider shines for this workload. */
  bestFor: string;
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

export interface CostEstimate {
  sessionId: string;
  generatedAt: string;
  workload: CostWorkload;
  /** The projected scales (mirrors COST_USER_SCALES). */
  scales: number[];
  providers: ProviderEstimate[];
  /** Cheapest provider id at each scale, keyed by the scale as a string. */
  cheapestByScale: Record<string, CostProviderId>;
  /** Best overall value (lowest summed cost across all scales). */
  recommended: CostProviderId;
  disclaimer: string;
}

/** The design-derived inputs the estimator needs. */
export interface CostEstimateInput extends CostWorkload {
  sessionId: string;
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

  const providers: ProviderEstimate[] = PRICING.map((p) => ({
    provider: p.id,
    name: p.name,
    model: p.model,
    summary: p.summary,
    bestFor: p.bestFor,
    externalDbNeeded: !!p.externalDbNeeded,
    costs: COST_USER_SCALES.map((users) => providerCostAtScale(p, users, workload)),
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

  // Best overall value = lowest summed monthly cost across all scales.
  let recommended = providers[0];
  const total = (pe: ProviderEstimate) =>
    pe.costs.reduce((s, c) => s + c.monthlyUsd, 0);
  for (const prov of providers) {
    if (total(prov) < total(recommended)) recommended = prov;
  }

  return {
    workload,
    scales: [...COST_USER_SCALES],
    providers,
    cheapestByScale,
    recommended: recommended.provider,
    disclaimer:
      'Ballpark estimates from public list prices for planning only — not quotes. ' +
      'Actual costs vary with usage patterns, region, reserved/committed discounts, and free tiers.',
  };
}
