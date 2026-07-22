/**
 * Hosting fit and reconciliation — why THIS provider, for THIS project, and how
 * that squares with the host the System Design already committed to.
 *
 * Two bugs live here, and they share a root: the cost estimator knew the prices
 * and nothing else about the project.
 *
 * 1. **The "why" was marketing copy.** `ProviderEstimate.bestFor` was a static
 *    string on the pricing table, copied verbatim into every estimate — so a
 *    1,000-user single-region MVP was told Cloudflare suits *"edge-first apps
 *    and heavy traffic on a tight budget"*, which describes a different product
 *    than the one being scoped. The field's own doc comment promised "where this
 *    provider shines **for this workload**"; the implementation never read the
 *    workload.
 *
 * 2. **Two stages crowned different winners in silence.** The System Design
 *    picks a host with a rationale tied to budget, timeline and scale; the Cost
 *    tab then ran `argmin(total monthly)` over all eight providers and labelled
 *    a *different* one "Best Value", with no acknowledgement that a decision had
 *    already been made. The owner is left holding two recommendations and no way
 *    to tell which is the real one. Notably the context was already there —
 *    `CostEstimateService` loads the system design for the effort estimate and
 *    the service subscriptions — the hosting decision just never looked at it.
 *
 * There is a third problem underneath both, which this repo had already written
 * down in `scaffold.compose.ts`: the estimator prices all eight providers **as
 * if any of them could run the design**. Cloudflare's compute is Workers, which
 * a long-lived NestJS server does not run on at all, so on small workloads the
 * cheapest option was frequently one that cannot host the product. That comment
 * ends *"the estimator recommending an infeasible host is its own bug, in its
 * own stage"* — this module is that bug being fixed at its source, so the
 * scaffold's refusal to inherit the recommendation is no longer load-bearing.
 *
 * Pure and runtime-free.
 */

import {
  copyFor,
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
  type LocalizedCopy,
} from './artifact-language';
import type {
  CostAtScale,
  CostCategory,
  CostHostingModel,
  CostProviderId,
} from './cost-estimate';
import type { ScaleTier } from './scale-tier';
import type { SystemDesign } from './system-design';

/** What the designed backend needs from a host at runtime. */
export type RuntimeStyle = 'long-running' | 'serverless' | 'unknown';

/** Whether a provider can actually run this design, and why not when it can't. */
export interface ProviderFit {
  viable: boolean;
  /** Present only when `viable` is false — the concrete reason. */
  note?: string;
  /**
   * Set when the provider is usable but its runtime does not match the design's
   * — a real trade-off rather than a veto.
   *
   * This is the middle ground the first cut lacked, and it mattered: with only
   * viable/not-viable, a 14-service long-running backend was offered "switch to
   * Vercel and save $135/mo". Vercel runs request-scoped functions, so that
   * saving is not a like-for-like swap, and presenting it as one would have been
   * a fresh instance of the very bug this module fixes. A caveated provider is
   * still priced and still compared — it is simply never put forward as the
   * cheaper alternative to act on.
   */
  caveat?: string;
}

/** The project facts the reasoning is generated from. */
export interface CostProjectProfile {
  scaleTier?: ScaleTier;
  /** Registered users, as resolved by `service-targets` — never a concurrency figure. */
  totalUsers?: number | null;
  /** Users active at once, stated or explicitly derived. */
  concurrentUsers?: number | null;
  /** The host the System Design already chose, when it names a recognizable one. */
  chosenProvider?: CostProviderId | null;
  /** How the designed backend runs — decides serverless feasibility. */
  runtime?: RuntimeStyle;
}

/**
 * How much cheaper an alternative must be before it is worth contradicting the
 * System Design's choice.
 *
 * A dollar or two a month is noise against the cost of revisiting an
 * architecture decision, re-doing the deploy config, and explaining the change
 * to a client. The alternative callout has to earn its interruption, so it fires
 * only on a gap that would actually change someone's mind.
 */
export const MEANINGFUL_SAVING_USD = 15;

/** Where the headline hosting recommendation came from. */
export type HostingRecommendationSource = 'system-design' | 'cheapest-viable';

export interface HostingAlternative {
  provider: CostProviderId;
  /** Monthly saving at the middle scale, rounded. */
  monthlySavingUsd: number;
  /** The explicit "you could switch, and here is the trade" line. */
  note: string;
}

export interface HostingRecommendation {
  provider: CostProviderId;
  source: HostingRecommendationSource;
  /** Why this provider, in this project's own numbers. */
  rationale: string;
  /**
   * A materially cheaper viable option, when one exists. Absent when the
   * recommendation is already the cheapest viable host, or when the gap is
   * under `MEANINGFUL_SAVING_USD`.
   */
  alternative?: HostingAlternative;
}

// ── reading the System Design's hosting choice ──────────────────────────────

/**
 * Provider names as they appear in a tech-stack row.
 *
 * Matched against the technology text of any layer, because a model writes the
 * host wherever it likes — "hosting: Render.com", "deployment: Render", or
 * "backend: NestJS on Render". Order matters only in that each pattern is
 * distinctive enough not to collide.
 */
const PROVIDER_PATTERNS: { id: CostProviderId; pattern: RegExp }[] = [
  { id: 'aws', pattern: /\b(?:aws|amazon web services|ec2|elastic beanstalk|fargate|lightsail)\b/i },
  { id: 'digitalocean', pattern: /\b(?:digital ?ocean|droplet)\b/i },
  { id: 'railway', pattern: /\brailway\b/i },
  { id: 'render', pattern: /\brender(?:\.com)?\b/i },
  { id: 'vercel', pattern: /\bvercel\b/i },
  { id: 'cloudflare', pattern: /\b(?:cloudflare|workers|pages\b.*\bcloudflare)\b/i },
  { id: 'flyio', pattern: /\bfly\.?io\b/i },
  { id: 'heroku', pattern: /\bheroku\b/i },
];

/** Layers where a hosting decision is normally recorded. */
const HOSTING_LAYER = /^(?:hosting|host|deployment|deploy|infrastructure|infra|platform|cloud|paas|iaas)$/i;

/**
 * The provider the System Design chose, or null when it named none we price.
 *
 * Hosting layers are read first so an explicit `hosting: Render` wins over an
 * incidental mention elsewhere; only then does it fall back to scanning the rest
 * of the stack. Returns **null rather than a guess** when nothing matches — the
 * `parseBudget` rule, and here it simply means the cost tab falls back to
 * recommending the cheapest viable host, which is the old behaviour.
 */
export function hostingChoiceFromDesign(
  design: Pick<SystemDesign, 'techStack'> | null | undefined,
): CostProviderId | null {
  const stack = design?.techStack ?? [];
  const inLayer = stack.filter((t) => HOSTING_LAYER.test((t.layer ?? '').trim()));
  return matchProvider(inLayer) ?? matchProvider(stack);
}

function matchProvider(
  rows: { technology?: string; rationale?: string }[],
): CostProviderId | null {
  for (const row of rows) {
    // The technology field is the decision; the rationale often *names the
    // rejected alternative* ("Render over Heroku"), so matching it would pick
    // the option the architect explicitly turned down.
    const text = row.technology ?? '';
    for (const { id, pattern } of PROVIDER_PATTERNS) {
      if (pattern.test(text)) return id;
    }
  }
  return null;
}

/**
 * How the designed backend runs, read from the tech stack.
 *
 * `unknown` when nothing in the stack settles it, and that is deliberately the
 * permissive answer: an unrecognised stack must not have providers struck off
 * on a guess. Only a positively identified long-running server rules serverless
 * hosts out.
 */
export function runtimeStyleFromDesign(
  design: Pick<SystemDesign, 'techStack'> | null | undefined,
): RuntimeStyle {
  const text = (design?.techStack ?? [])
    .map((t) => `${t.layer ?? ''} ${t.technology ?? ''}`)
    .join(' ');
  if (!text.trim()) return 'unknown';
  if (/\b(?:workers?|lambda|cloud functions?|serverless|edge runtime)\b/i.test(text)) {
    return 'serverless';
  }
  if (
    /\b(?:nestjs|nest\.js|express|fastify|koa|django|flask|fastapi|rails|laravel|spring|gin|echo|phoenix|adonis)\b/i.test(
      text,
    )
  ) {
    return 'long-running';
  }
  return 'unknown';
}

// ── feasibility ─────────────────────────────────────────────────────────────

/**
 * Can this provider actually host the design?
 *
 * Only one exclusion is asserted, and it is the one this repo has already
 * documented as fact: **Cloudflare's compute is Workers**, a request-scoped
 * V8 isolate runtime, which does not run a long-lived Node/Python/Ruby server
 * process. Recommending it for a NestJS modular monolith is not a pricing
 * opinion, it is an option the team cannot take.
 *
 * Vercel is **not** excluded — its serverless functions genuinely host a Next.js
 * app, and the estimator already prices the external database it needs. It gets
 * a caveat, not a veto.
 *
 * Everything else is viable, and an `unknown` runtime excludes nothing. The
 * asymmetry is deliberate: wrongly striking a provider hides a real option and
 * inflates the client's bill, while wrongly keeping one costs a line of
 * comparison table.
 */
export function providerFit(
  provider: CostProviderId,
  model: CostHostingModel,
  runtime: RuntimeStyle,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): ProviderFit {
  const copy = copyFor(FIT_COPY, language);
  if (runtime !== 'long-running') return { viable: true };
  if (provider === 'cloudflare') return { viable: false, note: copy.workersOnly };
  // Every other serverless host CAN run this design, but only through an
  // adapter and with request-scoped execution — a real trade-off, not a veto.
  if (model === 'serverless') return { viable: true, caveat: copy.serverlessAdapter };
  return { viable: true };
}

const FIT_COPY: LocalizedCopy<{ workersOnly: string; serverlessAdapter: string }> = {
  en: {
    workersOnly:
      'Cloudflare runs Workers, a request-scoped runtime that cannot host the long-running server process this design uses. Priced here for reference only.',
    serverlessAdapter:
      'Runs serverless functions rather than a long-running server, so this design would need an adapter and would run per request — not a like-for-like swap.',
  },
  ar: {
    workersOnly:
      'تشغّل Cloudflare خدمة Workers، وهي بيئة تنفيذ مرتبطة بالطلب ولا تستطيع استضافة عملية الخادم الدائمة التي يعتمدها هذا التصميم. السعر مذكور للمقارنة فقط.',
    serverlessAdapter:
      'يشغّل دوالّ بلا خادم بدل خادم دائم، لذا يحتاج هذا التصميم إلى محوّل وسيعمل لكل طلب على حدة — وهو ليس بديلًا مكافئًا.',
  },
};

// ── project-specific reasoning ──────────────────────────────────────────────

/** The cost category carrying the most dollars at a given scale. */
export function dominantCostDriver(cost: CostAtScale): CostCategory | null {
  let best: { category: CostCategory; monthlyUsd: number } | null = null;
  for (const item of cost.lineItems) {
    if (item.monthlyUsd <= 0) continue;
    if (!best || item.monthlyUsd > best.monthlyUsd) {
      best = { category: item.category, monthlyUsd: item.monthlyUsd };
    }
  }
  return best?.category ?? null;
}

/**
 * The per-provider "why", written from this project's computed numbers.
 *
 * Every clause is derived: the cost position comes from comparing this
 * provider's bill to the cheapest at the same scale, and the driver clause names
 * whichever category actually carries the most dollars **in this estimate**. So
 * the same provider reads differently on a 100-user MVP (where a flat platform
 * fee dominates) than on a 10,000-user product (where egress or database
 * capacity does) — which is the property that makes this a general fix rather
 * than a re-worded template.
 *
 * The **project budget is deliberately not referenced.** A stated budget is a
 * one-off build figure; a hosting estimate is recurring monthly spend, and
 * putting the two in one sentence would invite exactly the category error this
 * codebase avoids elsewhere. Budget still reaches the reasoning through
 * `scaleTier`, which `assessScaleTier` already derives partly from it.
 */
export function providerRationale(args: {
  monthlyUsd: number;
  cheapestMonthlyUsd: number;
  cost: CostAtScale;
  fit: ProviderFit;
  externalDbNeeded: boolean;
  profile: CostProjectProfile;
  language?: ArtifactLanguage;
}): string {
  const language = args.language ?? DEFAULT_ARTIFACT_LANGUAGE;
  const copy = copyFor(RATIONALE_COPY, language);
  if (!args.fit.viable) return args.fit.note ?? copy.notViable;

  const parts: string[] = [];
  const delta = Math.round(args.monthlyUsd - args.cheapestMonthlyUsd);
  parts.push(
    delta <= 0
      ? copy.cheapest(fmt(args.cost.users))
      : copy.costlierBy(String(delta), fmt(args.cost.users)),
  );

  const driver = dominantCostDriver(args.cost);
  if (driver) parts.push(copy.driver[driver]);
  if (args.fit.caveat) parts.push(args.fit.caveat);
  if (args.externalDbNeeded) parts.push(copy.externalDb);

  const concurrency = args.profile.concurrentUsers;
  if (concurrency && concurrency > 0) {
    parts.push(copy.concurrency(fmt(concurrency)));
  }

  return parts.join(' ');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n));
}

const RATIONALE_COPY: LocalizedCopy<{
  cheapest: (users: string) => string;
  costlierBy: (delta: string, users: string) => string;
  driver: Record<CostCategory, string>;
  externalDb: string;
  concurrency: (n: string) => string;
  notViable: string;
}> = {
  en: {
    cheapest: (users) =>
      `Lowest monthly bill of the providers priced here at ${users} users.`,
    costlierBy: (delta, users) =>
      `About $${delta}/mo more than the cheapest option at ${users} users.`,
    driver: {
      compute: 'At this size the bill is mostly application compute.',
      database: 'At this size the managed database is the largest line.',
      bandwidth: 'At this traffic level outbound bandwidth is the largest line.',
      storage: 'At this size stored data is the largest line.',
      platform: 'At this size a fixed platform fee is the largest line.',
    },
    externalDb: 'No first-class managed database — an external one is priced in above.',
    concurrency: (n) => `Sized for roughly ${n} users active at once.`,
    notViable: 'Not a viable host for this design; priced for reference only.',
  },
  ar: {
    cheapest: (users) =>
      `أقل فاتورة شهرية بين المزودين المذكورين عند ${users} مستخدم.`,
    costlierBy: (delta, users) =>
      `أعلى بنحو ${delta} دولار شهريًا من أرخص خيار عند ${users} مستخدم.`,
    driver: {
      compute: 'عند هذا الحجم تتكوّن الفاتورة أساسًا من حوسبة التطبيق.',
      database: 'عند هذا الحجم تمثل قاعدة البيانات المُدارة أكبر بند.',
      bandwidth: 'عند هذا المستوى من الحركة يمثل النطاق الصادر أكبر بند.',
      storage: 'عند هذا الحجم تمثل البيانات المخزّنة أكبر بند.',
      platform: 'عند هذا الحجم تمثل رسوم المنصة الثابتة أكبر بند.',
    },
    externalDb: 'لا توجد قاعدة بيانات مُدارة أصلية — تم تسعير قاعدة خارجية أعلاه.',
    concurrency: (n) => `مُحجَّم لنحو ${n} مستخدم نشط في الوقت نفسه.`,
    notViable: 'ليس خيار استضافة صالحًا لهذا التصميم؛ السعر للمقارنة فقط.',
  },
};

// ── reconciliation with the System Design ───────────────────────────────────

const RECONCILE_COPY: LocalizedCopy<{
  fromDesign: (name: string) => string;
  cheapestViable: (name: string) => string;
  alternative: (chosen: string, alt: string, saving: string) => string;
}> = {
  en: {
    fromDesign: (name) =>
      `${name} is the host chosen in the System Design, and the figures below are what that choice costs at each scale.`,
    cheapestViable: (name) =>
      `The System Design did not name a host we price, so ${name} is shown as the lowest-cost option that can actually run this design.`,
    alternative: (chosen, alt, saving) =>
      `${alt} would run roughly $${saving}/mo less than ${chosen} at this scale. Worth a look if you are open to switching; otherwise keep the System Design's choice, which was made against this project's budget and timeline.`,
  },
  ar: {
    fromDesign: (name) =>
      `${name} هو خيار الاستضافة المعتمد في تصميم النظام، والأرقام أدناه هي تكلفة هذا الخيار عند كل حجم.`,
    cheapestViable: (name) =>
      `لم يُسمِّ تصميم النظام مزودًا ضمن قائمة التسعير، لذلك يظهر ${name} بوصفه الخيار الأقل تكلفة القادر فعليًا على تشغيل هذا التصميم.`,
    alternative: (chosen, alt, saving) =>
      `سيكلّف ${alt} أقل بنحو ${saving} دولار شهريًا من ${chosen} عند هذا الحجم. يستحق النظر إن كنت منفتحًا على التغيير؛ وإلا فالتزم بخيار تصميم النظام الذي اتُّخذ في ضوء ميزانية المشروع وجدوله الزمني.`,
  },
};

/**
 * Reconcile the cost comparison with the hosting decision already made.
 *
 * **Option A of the two the brief offered**, and the one worth building: the
 * table still prices every provider, but the headline follows the System
 * Design's choice whenever that choice is viable, and a cheaper option is
 * raised as an explicit, quantified *alternative* rather than a silently
 * competing verdict. Option B (make the cost page simply echo the design) would
 * have thrown away the comparison that makes this stage worth having.
 *
 * The System Design's choice wins ties and near-ties on purpose. It was made
 * against the project's budget, timeline and scale — real constraints this
 * function cannot see — so a few dollars a month is not grounds to overturn it,
 * and `MEANINGFUL_SAVING_USD` is where "cheaper" becomes "worth the churn".
 */
export function reconcileHosting(args: {
  /** Every provider, with its viability and its bill at the comparison scale. */
  candidates: {
    provider: CostProviderId;
    name: string;
    monthlyUsd: number;
    fit: ProviderFit;
  }[];
  chosenProvider: CostProviderId | null;
  language?: ArtifactLanguage;
}): HostingRecommendation | null {
  const language = args.language ?? DEFAULT_ARTIFACT_LANGUAGE;
  const copy = copyFor(RECONCILE_COPY, language);
  const viable = args.candidates.filter((c) => c.fit.viable);
  if (viable.length === 0) return null;

  const cheapest = viable.reduce((best, c) =>
    c.monthlyUsd < best.monthlyUsd ? c : best,
  );
  const chosen =
    (args.chosenProvider &&
      viable.find((c) => c.provider === args.chosenProvider)) ||
    null;

  const primary = chosen ?? cheapest;
  const rationale = chosen
    ? copy.fromDesign(chosen.name)
    : copy.cheapestViable(cheapest.name);

  // The alternative is a recommendation to ACT on, so it is drawn only from
  // providers with no runtime caveat — offering "switch to Vercel and save
  // $135/mo" for a long-running backend would be a like-for-like claim that
  // isn't. Caveated hosts stay in the table and can still be the primary when
  // the System Design deliberately chose one.
  const switchable = viable.filter((c) => !c.fit.caveat);
  const cheapestSwitchable = switchable.length
    ? switchable.reduce((best, c) => (c.monthlyUsd < best.monthlyUsd ? c : best))
    : null;

  const saving = cheapestSwitchable
    ? Math.round(primary.monthlyUsd - cheapestSwitchable.monthlyUsd)
    : 0;
  const alternative =
    cheapestSwitchable &&
    cheapestSwitchable.provider !== primary.provider &&
    saving >= MEANINGFUL_SAVING_USD
      ? {
          provider: cheapestSwitchable.provider,
          monthlySavingUsd: saving,
          note: copy.alternative(primary.name, cheapestSwitchable.name, String(saving)),
        }
      : undefined;

  return {
    provider: primary.provider,
    source: chosen ? 'system-design' : 'cheapest-viable',
    rationale,
    ...(alternative ? { alternative } : {}),
  };
}
