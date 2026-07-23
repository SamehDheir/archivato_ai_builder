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

/**
 * What the System Design decided about hosting — as three distinct states, not
 * as a nullable provider id.
 *
 * This is the fix for the bug that produced *"The System Design did not name a
 * host we price, so Fly.io is shown as the lowest-cost option"* on a project
 * whose architecture had explicitly chosen **Azure App Service (Linux) – Jordan
 * region**, justified by a data-residency requirement. Nothing was broken in the
 * plumbing: `CostEstimateService` loads the system design and passes its hosting
 * choice through, and `reconcileHosting` reads it. The defect was that the choice
 * was carried as `CostProviderId | null`, and `null` was answering two completely
 * different questions with one value:
 *
 * - *"the design named no host"* — where falling back to the cheapest viable
 *   option is exactly right, and
 * - *"the design named a host that is not in our pricing table"* — where falling
 *   back silently discards a decision that was already made, on constraints this
 *   function cannot see, and then **states in prose that no decision exists**.
 *
 * Azure hitting the second branch was a coincidence of the table's contents, but
 * the false sentence was structural: any host outside the priced set produced it.
 * Widening the table (Azure, Google Cloud and a self-managed VPS are priced now)
 * fixes the reported case; making the state explicit is what stops the *class*,
 * because a design can always name a host nobody has priced — a local datacentre,
 * on-premise hardware, a regional cloud.
 *
 * With three states the false claim is unreachable by construction: the "no host
 * was named" copy is emitted **only** under `kind: 'none'`.
 */
export type HostingChoice =
  /** The design named a host this table prices. */
  | { kind: 'priced'; provider: CostProviderId; label?: string }
  /** The design named a host, and it is not one we price. `label` is its own wording. */
  | { kind: 'unpriced'; label: string }
  /** The design genuinely names no hosting provider. */
  | { kind: 'none' };

/**
 * A hard constraint the hosting decision was made against — data residency, a
 * named region, a sovereignty rule.
 *
 * When one exists, a cheaper provider is **not** a like-for-like alternative, and
 * presenting it as a pure cost win is the same category of error as recommending
 * a host that cannot run the design. Price is one axis; legality is another, and
 * this estimator can only see the first.
 */
export interface HostingConstraint {
  /** The sentence in the design that ties hosting to the constraint. */
  evidence: string;
  /** The region it pins the deployment to, when the design names one. */
  region?: string;
}

/** The project facts the reasoning is generated from. */
export interface CostProjectProfile {
  scaleTier?: ScaleTier;
  /** Registered users, as resolved by `service-targets` — never a concurrency figure. */
  totalUsers?: number | null;
  /** Users active at once, stated or explicitly derived. */
  concurrentUsers?: number | null;
  /**
   * What the System Design decided about hosting. Absent reads as `{kind:'none'}`
   * — a caller that did not supply a design told us nothing about one.
   */
  chosenHosting?: HostingChoice;
  /** A residency/locality constraint the hosting choice was made against. */
  hostingConstraint?: HostingConstraint | null;
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

/**
 * Where the headline hosting recommendation came from.
 *
 * The last three are all "the design's choice is not the headline", and they are
 * kept distinct because they are three different things to tell an owner. Only
 * `cheapest-viable` means no decision was made — which is why it is the only one
 * whose copy may say so.
 */
export type HostingRecommendationSource =
  /** The design's host, priced and viable. The normal case. */
  | 'system-design'
  /** The design named a host this table does not price. */
  | 'design-unpriced'
  /** The design named a host that cannot run this design. */
  | 'design-not-viable'
  /** The design named no host at all. */
  | 'cheapest-viable';

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
   * The design's hosting choice **in its own wording** ("Azure App Service
   * (Linux) – Jordan region"), whenever it named one — including when we cannot
   * price it. Present for every source except `cheapest-viable`, so the UI can
   * always show the decision the architecture actually made rather than dropping
   * it because the pricing table has no column for it.
   */
  chosenLabel?: string;
  /**
   * A materially cheaper viable option, when one exists. Absent when the
   * recommendation is already the cheapest viable host, or when the gap is
   * under `MEANINGFUL_SAVING_USD`.
   */
  alternative?: HostingAlternative;
  /**
   * The compliance/locality trade-off any switch would have to clear, when the
   * design ties its host to one. Emitted whether or not an `alternative` exists:
   * the constraint is a fact about the project, and an owner reading a table of
   * cheaper providers needs it in front of them either way.
   */
  constraintNote?: string;
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
  { id: 'azure', pattern: /\bazure\b/i },
  { id: 'gcp', pattern: /\b(?:gcp|google cloud|google app engine|app engine|cloud run|firebase)\b/i },
  { id: 'digitalocean', pattern: /\b(?:digital ?ocean|droplet)\b/i },
  { id: 'railway', pattern: /\brailway\b/i },
  { id: 'render', pattern: /\brender(?:\.com)?\b/i },
  { id: 'vercel', pattern: /\bvercel\b/i },
  { id: 'cloudflare', pattern: /\b(?:cloudflare|workers|pages\b.*\bcloudflare)\b/i },
  { id: 'flyio', pattern: /\bfly\.?io\b/i },
  { id: 'heroku', pattern: /\bheroku\b/i },
  // Last on purpose: a named cloud always wins over the generic self-managed
  // bucket. `on-premise` is deliberately NOT here — this row prices a rented
  // VPS, and pricing someone's own datacentre hardware against it would be a
  // confidently wrong number. On-prem falls through to `unpriced`, which says so.
  {
    id: 'vps',
    pattern:
      /\b(?:vps|virtual private server|bare[- ]?metal|dedicated server|hetzner|linode|vultr|contabo|ovh(?:cloud)?|scaleway)\b/i,
  },
];

/** Layers where a hosting decision is normally recorded. */
const HOSTING_LAYER = /^(?:hosting|host|deployment|deploy|infrastructure|infra|platform|cloud|paas|iaas)$/i;

/**
 * The subset of `HOSTING_LAYER` whose name alone is evidence that the row holds
 * a **host**, used when inferring that an unrecognised technology is one.
 *
 * `platform` is dropped here and kept above, and the asymmetry is the point: a
 * positive provider-name match is its own evidence wherever it appears, but
 * concluding "this unfamiliar string must be a hosting provider" from a row
 * labelled `platform` would misread `platform: Node.js 20` as a chosen host and
 * suppress the recommendation entirely.
 */
const HOSTING_LAYER_STRICT = /^(?:hosting|host|deployment|deploy|infrastructure|infra|cloud|paas|iaas)$/i;

/** Below this a "host" is a stray token, above it the label is prose, not a name. */
const MIN_HOST_LABEL_CHARS = 3;
const MAX_HOST_LABEL_CHARS = 80;

/**
 * What the System Design decided about hosting — resolved into the three states
 * that actually exist, so no caller has to infer one from a null.
 *
 * Hosting layers are read first so an explicit `hosting: Render` wins over an
 * incidental mention elsewhere; only then does it fall back to scanning the rest
 * of the stack. If nothing matches the priced set, a strictly-hosting-named layer
 * carrying real text is reported as **`unpriced` with the design's own wording**
 * rather than being flattened into "no host".
 */
export function resolveHostingChoice(
  design: Pick<SystemDesign, 'techStack'> | null | undefined,
): HostingChoice {
  const stack = design?.techStack ?? [];
  const inLayer = stack.filter((t) => HOSTING_LAYER.test((t.layer ?? '').trim()));

  const matched = matchProviderRow(inLayer) ?? matchProviderRow(stack);
  if (matched) {
    return {
      kind: 'priced',
      provider: matched.id,
      ...(matched.label ? { label: matched.label } : {}),
    };
  }

  const named = stack
    .filter((t) => HOSTING_LAYER_STRICT.test((t.layer ?? '').trim()))
    .map((t) => hostLabel(t.technology))
    .find((label) => label.length >= MIN_HOST_LABEL_CHARS);

  return named ? { kind: 'unpriced', label: named } : { kind: 'none' };
}

/**
 * The provider the System Design chose, or null when it named none we price.
 *
 * Retained because "which of our priced providers did they pick" is still a real
 * question with a real null answer. **Do not use it to decide whether a host was
 * named at all** — that is what conflated the two states and produced the false
 * "did not name a host" claim; call `resolveHostingChoice` for that.
 */
export function hostingChoiceFromDesign(
  design: Pick<SystemDesign, 'techStack'> | null | undefined,
): CostProviderId | null {
  const choice = resolveHostingChoice(design);
  return choice.kind === 'priced' ? choice.provider : null;
}

function matchProviderRow(
  rows: { technology?: string; rationale?: string }[],
): { id: CostProviderId; label: string } | null {
  for (const row of rows) {
    // The technology field is the decision; the rationale often *names the
    // rejected alternative* ("Render over Heroku"), so matching it would pick
    // the option the architect explicitly turned down.
    const text = row.technology ?? '';
    for (const { id, pattern } of PROVIDER_PATTERNS) {
      if (pattern.test(text)) return { id, label: hostLabel(text) };
    }
  }
  return null;
}

/** A tech-stack value reduced to a single bounded line fit to quote back. */
function hostLabel(technology: string | undefined): string {
  const text = (technology ?? '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_HOST_LABEL_CHARS
    ? `${text.slice(0, MAX_HOST_LABEL_CHARS).trimEnd()}…`
    : text;
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
  const stack = design?.techStack ?? [];
  const all = stack.map((t) => `${t.layer ?? ''} ${t.technology ?? ''}`).join(' ');
  if (!all.trim()) return 'unknown';

  // **The hosting rows are excluded from the serverless test, and only from
  // that one.** Otherwise the feasibility check is circular: `hosting:
  // Cloudflare Workers` would make the design "serverless", which makes
  // Cloudflare a viable host — the chosen provider vouching for itself. A design
  // whose backend is NestJS and whose hosting row says Workers is a genuine
  // contradiction, and it has to surface as one rather than being resolved in
  // favour of the row under evaluation.
  //
  // Long-running detection still reads the whole stack, because a framework name
  // is a statement about the *application* no matter which row it appears in.
  const appLayers = stack
    .filter((t) => !HOSTING_LAYER.test((t.layer ?? '').trim()))
    .map((t) => `${t.layer ?? ''} ${t.technology ?? ''}`)
    .join(' ');
  if (
    /\b(?:workers?|lambda|cloud functions?|serverless|edge runtime)\b/i.test(appLayers)
  ) {
    return 'serverless';
  }
  if (
    /\b(?:nestjs|nest\.js|express|fastify|koa|django|flask|fastapi|rails|laravel|spring|gin|echo|phoenix|adonis)\b/i.test(
      all,
    )
  ) {
    return 'long-running';
  }
  // No application-side signal either way. A serverless *host* with nothing to
  // contradict it is still a serverless design — the circularity only matters
  // when the application says otherwise, which the branch above has ruled out.
  return /\b(?:workers?|lambda|cloud functions?|serverless|edge runtime)\b/i.test(all)
    ? 'serverless'
    : 'unknown';
}

// ── the constraint the hosting choice was made against ──────────────────────

/**
 * Placement language — a statement about **where** the system may run.
 *
 * Deliberately narrower than "mentions compliance". Almost every enterprise
 * design's rationale says the word *compliance* somewhere, so keying on it would
 * attach a residency caveat to every project and teach the owner to ignore the
 * one that matters — the `describesSameCapability` calibration. What qualifies is
 * language about location: residency, sovereignty, staying inside a border.
 */
const RESIDENCY_PROSE =
  /\b(?:data[\s-]*residency|data[\s-]*sovereignty|data[\s-]*locali[sz]ation|residency|sovereign(?:ty)?|in[-\s]region|in[-\s]country|on[-\s]?premises?|on[-\s]?prem\b|hosted (?:in|within)|stored (?:in|within)|remains? (?:in|within)|kept (?:in|within)|must not leave|cannot leave)\b/i;

/**
 * The same, in Arabic. No `\b` anywhere — JavaScript's word boundary is
 * ASCII-only and never fires next to Arabic script, so an anchored pattern would
 * be a permanently silent check on exactly the market this product sells into.
 */
const RESIDENCY_AR =
  /إقامة البيانات|سيادة البيانات|توطين البيانات|تخزين البيانات داخل|داخل (?:المملكة|البلد|الدولة|حدود|الأردن)|لا تغادر|محلي[اًّ]?\s*داخل/;

/** A technology string pinned to a place: "… – Jordan region", "eu-west-1". */
const LOCATION_PINNED = /\b(?:region|zone|datacent(?:er|re)|on[-\s]?prem(?:ise|ises)?)\b/i;

/** "Jordan region" → "Jordan". Capitalisation is what distinguishes a place name. */
const NAMED_REGION = /([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)\s+(?:region|zone|datacent(?:er|re))\b/;

/** Long enough to be a reason, short enough to quote in a card. */
const MAX_EVIDENCE_CHARS = 160;

/**
 * The residency/locality constraint the hosting decision was made against, or
 * null when the design states none.
 *
 * Two independent signals, either of which qualifies:
 *
 * 1. **The hosting row is pinned to a place** — "Azure App Service (Linux) –
 *    Jordan region". A host chosen with a region written into its name was not
 *    chosen on price, and a comparison that ignores that is comparing the wrong
 *    thing.
 * 2. **Residency language anywhere in the design's reasoning**, including
 *    `constraintCompliance` and any constraints the caller passes in. The whole
 *    stack is the haystack on purpose: on the real project that produced this
 *    bug, the hosting row's rationale talked about SLAs and DevOps staffing while
 *    *"Meets data-residency requirement"* sat on the **database** row. Reading
 *    only the hosting row would have missed the constraint that mattered.
 *
 * Conservative in the safe direction, and the asymmetry is deliberate: a false
 * positive costs one cautionary sentence telling an owner to check a regional
 * requirement that turns out not to bind, while a false negative is the reported
 * bug — quietly advising a client to move off a host their own compliance
 * requirement put them on.
 */
export function hostingConstraintFromDesign(
  design:
    | (Pick<SystemDesign, 'techStack'> &
        Partial<Pick<SystemDesign, 'constraintCompliance'>>)
    | null
    | undefined,
  extraConstraints: (string | undefined | null)[] = [],
): HostingConstraint | null {
  const stack = design?.techStack ?? [];
  const hostingRows = stack.filter((t) =>
    HOSTING_LAYER_STRICT.test((t.layer ?? '').trim()),
  );
  const pinned = hostingRows.find((t) => LOCATION_PINNED.test(t.technology ?? ''));

  const haystack: string[] = [
    ...stack.map((t) => t.rationale ?? ''),
    ...stack.map((t) => t.technology ?? ''),
    ...(design?.constraintCompliance ?? []).flatMap((c) => [
      c.constraint ?? '',
      c.howAddressed ?? '',
    ]),
    ...extraConstraints.map((c) => c ?? ''),
  ];
  const stated = haystack.find(
    (text) => text && (RESIDENCY_PROSE.test(text) || RESIDENCY_AR.test(text)),
  );

  if (!stated && !pinned) return null;

  const region = stack
    .map((t) => NAMED_REGION.exec(t.technology ?? '')?.[1])
    .find((r): r is string => !!r);

  return {
    evidence: clampEvidence(stated || pinned?.technology || ''),
    ...(region ? { region } : {}),
  };
}

function clampEvidence(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > MAX_EVIDENCE_CHARS
    ? `${one.slice(0, MAX_EVIDENCE_CHARS).trimEnd()}…`
    : one;
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
  // Unconditional, unlike the runtime caveats below: a self-managed box is a
  // viable host for any runtime, but its bill is not comparable to a managed
  // one — the figures buy hardware, not patching, backups, failover or the
  // person who gets paged. It stays in the table and can be the primary when the
  // design deliberately chose it; it is simply never the "switch here and save"
  // pitch, which would quietly price a team's operations work at zero.
  if (provider === 'vps') return { viable: true, caveat: copy.selfManaged };
  if (runtime !== 'long-running') return { viable: true };
  if (provider === 'cloudflare') return { viable: false, note: copy.workersOnly };
  // Every other serverless host CAN run this design, but only through an
  // adapter and with request-scoped execution — a real trade-off, not a veto.
  if (model === 'serverless') return { viable: true, caveat: copy.serverlessAdapter };
  return { viable: true };
}

const FIT_COPY: LocalizedCopy<{
  workersOnly: string;
  serverlessAdapter: string;
  selfManaged: string;
}> = {
  en: {
    workersOnly:
      'Cloudflare runs Workers, a request-scoped runtime that cannot host the long-running server process this design uses. Priced here for reference only.',
    serverlessAdapter:
      'Runs serverless functions rather than a long-running server, so this design would need an adapter and would run per request — not a like-for-like swap.',
    selfManaged:
      'Self-managed: these figures cover the servers only. Patching, backups, monitoring and failover are your team’s time, which the comparison does not price.',
  },
  ar: {
    workersOnly:
      'تشغّل Cloudflare خدمة Workers، وهي بيئة تنفيذ مرتبطة بالطلب ولا تستطيع استضافة عملية الخادم الدائمة التي يعتمدها هذا التصميم. السعر مذكور للمقارنة فقط.',
    serverlessAdapter:
      'يشغّل دوالّ بلا خادم بدل خادم دائم، لذا يحتاج هذا التصميم إلى محوّل وسيعمل لكل طلب على حدة — وهو ليس بديلًا مكافئًا.',
    selfManaged:
      'إدارة ذاتية: تغطي هذه الأرقام الخوادم فقط. أما التحديثات والنسخ الاحتياطي والمراقبة وتجاوز الأعطال فهي وقت فريقك، ولا تشمله المقارنة.',
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
  fromDesign: (name: string, label: string) => string;
  unpriced: (label: string, name: string) => string;
  notViable: (label: string, name: string, reason: string) => string;
  cheapestViable: (name: string) => string;
  alternative: (chosen: string, alt: string, saving: string) => string;
  constraintWithRegion: (region: string, evidence: string) => string;
  constraint: (evidence: string) => string;
}> = {
  en: {
    fromDesign: (name, label) =>
      `${label} is the host chosen in the System Design, and the figures below are what that choice costs at each scale.${
        label.toLowerCase().includes(name.toLowerCase()) ? '' : ` Priced here as ${name}.`
      }`,
    unpriced: (label, name) =>
      `The System Design chose ${label}. This comparison does not price that provider, so the figures below describe alternatives to it, not its own bill — check its published pricing before quoting a running cost. ${name} is the lowest-cost priced option that could run this design.`,
    notViable: (label, name, reason) =>
      `The System Design names ${label}, but it cannot run this design: ${reason} ${name} is shown instead as the lowest-cost option that can. Take this back to the architecture rather than treating it as a price decision.`,
    cheapestViable: (name) =>
      `The System Design does not name a hosting provider, so ${name} is shown as the lowest-cost option that can actually run this design.`,
    alternative: (chosen, alt, saving) =>
      `${alt} would run roughly $${saving}/mo less than ${chosen} at this scale. Worth a look if you are open to switching; otherwise keep the System Design's choice, which was made against this project's budget and timeline.`,
    constraintWithRegion: (region, evidence) =>
      `Before switching on price alone: the System Design ties this host to a ${region} deployment (“${evidence}”). Any replacement has to offer ${region} hosting as well — this comparison ranks providers on cost only and does not check regional availability or data-residency law.`,
    constraint: (evidence) =>
      `Before switching on price alone: the System Design ties this host to a data-residency or locality requirement (“${evidence}”). Any replacement has to satisfy it too — this comparison ranks providers on cost only and does not check that.`,
  },
  ar: {
    fromDesign: (name, label) =>
      `${label} هو خيار الاستضافة المعتمد في تصميم النظام، والأرقام أدناه هي تكلفة هذا الخيار عند كل حجم.${
        label.toLowerCase().includes(name.toLowerCase()) ? '' : ` تم تسعيره هنا ضمن ${name}.`
      }`,
    unpriced: (label, name) =>
      `اختار تصميم النظام ${label}. هذه المقارنة لا تُسعّر هذا المزود، لذا تصف الأرقام أدناه بدائل عنه لا فاتورته هو — راجع تسعيره المنشور قبل تحديد تكلفة تشغيل للعميل. و${name} هو الخيار الأقل تكلفة بين المزودين المُسعّرين القادرين على تشغيل هذا التصميم.`,
    notViable: (label, name, reason) =>
      `يسمّي تصميم النظام ${label}، لكنه لا يستطيع تشغيل هذا التصميم: ${reason} لذلك يظهر ${name} بوصفه الخيار الأقل تكلفة القادر على ذلك. أعد هذا الأمر إلى مرحلة التصميم بدل التعامل معه كقرار تكلفة.`,
    cheapestViable: (name) =>
      `لا يسمّي تصميم النظام أي مزود استضافة، لذلك يظهر ${name} بوصفه الخيار الأقل تكلفة القادر فعليًا على تشغيل هذا التصميم.`,
    alternative: (chosen, alt, saving) =>
      `سيكلّف ${alt} أقل بنحو ${saving} دولار شهريًا من ${chosen} عند هذا الحجم. يستحق النظر إن كنت منفتحًا على التغيير؛ وإلا فالتزم بخيار تصميم النظام الذي اتُّخذ في ضوء ميزانية المشروع وجدوله الزمني.`,
    constraintWithRegion: (region, evidence) =>
      `قبل التغيير لاعتبارات السعر وحدها: يربط تصميم النظام هذا الخيار بنشر داخل ${region} («${evidence}»). وأي بديل يجب أن يوفّر الاستضافة في ${region} أيضًا — فهذه المقارنة ترتّب المزودين بالتكلفة فقط ولا تتحقق من التوافر الإقليمي أو أحكام إقامة البيانات.`,
    constraint: (evidence) =>
      `قبل التغيير لاعتبارات السعر وحدها: يربط تصميم النظام هذا الخيار بمتطلب إقامة بيانات أو موقع جغرافي («${evidence}»). وأي بديل يجب أن يستوفيه أيضًا — فهذه المقارنة ترتّب المزودين بالتكلفة فقط ولا تتحقق من ذلك.`,
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
  /**
   * What the System Design decided — the three real states, never a nullable id.
   * Absent reads as `{kind:'none'}`, which is the only value whose copy is
   * allowed to say that no host was named.
   */
  chosen?: HostingChoice;
  /** A residency/locality constraint the choice was made against. */
  constraint?: HostingConstraint | null;
  language?: ArtifactLanguage;
}): HostingRecommendation | null {
  const language = args.language ?? DEFAULT_ARTIFACT_LANGUAGE;
  const copy = copyFor(RECONCILE_COPY, language);
  const chosen: HostingChoice = args.chosen ?? { kind: 'none' };
  const viable = args.candidates.filter((c) => c.fit.viable);
  if (viable.length === 0) return null;

  // The alternative is a recommendation to ACT on, so it is drawn only from
  // providers with no caveat — offering "switch to Vercel and save $135/mo" for
  // a long-running backend, or "switch to a VPS" to a team with no ops capacity,
  // would be a like-for-like claim that isn't. Caveated hosts stay in the table
  // and can still be the primary when the System Design deliberately chose one.
  const switchable = viable.filter((c) => !c.fit.caveat);
  const cheapestOf = (pool: typeof viable) =>
    pool.reduce((best, c) => (c.monthlyUsd < best.monthlyUsd ? c : best));
  const cheapestSwitchable = switchable.length ? cheapestOf(switchable) : null;
  // When the design named nothing we still owe a recommendation, and it should
  // be one the team can act on — so an uncaveated host is preferred over a
  // marginally cheaper one that comes with a runtime or operations asterisk.
  const fallback = cheapestSwitchable ?? cheapestOf(viable);

  const designPick =
    chosen.kind === 'priced'
      ? args.candidates.find((c) => c.provider === chosen.provider) ?? null
      : null;

  // Four states, four sentences. The "no host was named" line is reachable only
  // from `kind: 'none'` — which is the whole point of the discriminated union,
  // and what makes the reported false claim impossible rather than merely fixed.
  let primary = fallback;
  let source: HostingRecommendationSource = 'cheapest-viable';
  let rationale = copy.cheapestViable(fallback.name);

  if (designPick && designPick.fit.viable) {
    primary = designPick;
    source = 'system-design';
    rationale = copy.fromDesign(designPick.name, chosen.kind === 'priced' && chosen.label ? chosen.label : designPick.name);
  } else if (designPick) {
    source = 'design-not-viable';
    rationale = copy.notViable(
      chosen.kind === 'priced' && chosen.label ? chosen.label : designPick.name,
      fallback.name,
      designPick.fit.note ?? '',
    );
  } else if (chosen.kind === 'unpriced') {
    source = 'design-unpriced';
    rationale = copy.unpriced(chosen.label, fallback.name);
  }

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

  // The constraint belongs to the design's decision, so it is emitted whenever
  // the design made one — with or without an alternative to switch to. An owner
  // scanning a table of cheaper providers needs the reason their architecture
  // picked a dearer one, not just a warning attached to one specific swap.
  const chosenLabel =
    chosen.kind === 'unpriced'
      ? chosen.label
      : chosen.kind === 'priced'
        ? chosen.label ?? designPick?.name
        : undefined;
  const constraintNote =
    args.constraint && chosen.kind !== 'none'
      ? args.constraint.region
        ? copy.constraintWithRegion(args.constraint.region, args.constraint.evidence)
        : copy.constraint(args.constraint.evidence)
      : undefined;

  return {
    provider: primary.provider,
    source,
    rationale,
    ...(chosenLabel ? { chosenLabel } : {}),
    ...(alternative ? { alternative } : {}),
    ...(constraintNote ? { constraintNote } : {}),
  };
}
