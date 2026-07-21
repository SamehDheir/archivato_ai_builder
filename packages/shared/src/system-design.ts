/**
 * The System Design — output of the System Architect stage (spec Step 4).
 * Produced from a confirmed interview + its Requirement Document.
 */

import type { LocalizedArtifact } from './artifact-language';
import type { GenerationProvenance } from './generation';
import type { FunctionalRequirement, UserRole } from './requirements';
import { paymentAvailabilityFor, paymentProvidersFor } from './region';
import { significantTokens } from './text';

export type ArchitectureType =
  | 'monolith'
  | 'modular_monolith'
  | 'microservices';

export interface TechChoice {
  /** backend | frontend | database | cache | queue | auth | … */
  layer: string;
  technology: string;
  rationale: string;
}

/** Rough build effort of a module (R8), coarse t-shirt sizes. */
export type ModuleComplexity = 'S' | 'M' | 'L' | 'XL';

/** Stable order for rendering / validation. */
export const MODULE_COMPLEXITIES: readonly ModuleComplexity[] = [
  'S',
  'M',
  'L',
  'XL',
] as const;

export function isModuleComplexity(value: string): value is ModuleComplexity {
  return (MODULE_COMPLEXITIES as readonly string[]).includes(value);
}

export interface ServiceModule {
  /** e.g. Auth, Users, Billing, Notifications. */
  name: string;
  responsibility: string;
  /** Names of other services this one depends on. */
  dependencies: string[];
  /**
   * Rough build effort (R8), groundwork for a later effort estimate. Optional so
   * old rows and plan-mode runs render fine; generation always fills it (the LLM
   * path is backfilled, the fallback derives it from a heuristic).
   */
  complexity?: ModuleComplexity;
  /** One-line justification for the complexity rating. */
  complexityRationale?: string;
}

/** Whether a capability is best built in-house or bought from a service (R8). */
export type BuildVsBuyRecommendation = 'build' | 'buy';

/**
 * The standard capabilities the build-vs-buy analysis reasons about. A closed
 * set so the edit DTO can reject an unknown capability and the agent can
 * allowlist LLM output against it.
 */
export const BUILD_VS_BUY_CAPABILITIES = [
  'auth',
  'payments',
  'notifications',
  'file_storage',
  'maps_geo',
  'search',
] as const;

export type BuildVsBuyCapability = (typeof BUILD_VS_BUY_CAPABILITIES)[number];

export function isBuildVsBuyCapability(
  value: string,
): value is BuildVsBuyCapability {
  return (BUILD_VS_BUY_CAPABILITIES as readonly string[]).includes(value);
}

export interface BuildVsBuyItem {
  capability: BuildVsBuyCapability;
  recommendation: BuildVsBuyRecommendation;
  /** A concrete, well-known service to use when recommending "buy". */
  suggestedService?: string;
  rationale: string;
  /** The time/cost/risk impact of following the recommendation. */
  impact: string;
}

/**
 * A phased plan, emitted only when the interview states large-scale ambitions
 * that conflict with a tight budget/timeline — so the architect can name both
 * the pragmatic MVP and the growth path instead of silently picking one side.
 */
export interface PhasedArchitecture {
  /** What to build first, right-sized for the budget/timeline. */
  mvp: string;
  /** How the architecture evolves as scale materializes. */
  growthPath: string;
  /** What the migration from MVP to the growth architecture involves. */
  migrationNotes: string;
}

/** How one stated constraint is addressed by the design (R8). */
export interface ConstraintCompliance {
  /** The constraint, from an interview slot or a requirement. */
  constraint: string;
  howAddressed: string;
}

export interface SystemDesign extends LocalizedArtifact {
  sessionId: string;
  generatedAt: string;
  /** How this design was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  architecture: ArchitectureType;
  architectureRationale: string;
  techStack: TechChoice[];
  services: ServiceModule[];
  /**
   * Build-vs-buy analysis over the standard capabilities the requirements imply
   * (R8). Optional/back-compat; generation always fills it for the applicable
   * capabilities.
   */
  buildVsBuy?: BuildVsBuyItem[];
  /**
   * Present only when scale ambitions conflict with the budget/timeline (R8);
   * absent otherwise.
   */
  phasedArchitecture?: PhasedArchitecture;
  /**
   * How each stated constraint is met (R8). Absent/empty when no constraints
   * exist.
   */
  constraintCompliance?: ConstraintCompliance[];
  /**
   * Functional requirement ids that no service in this design covers.
   *
   * Optional and usually absent. It exists because a requirement can be dropped
   * on the floor silently: a "Coupon/Discount System" requirement survived into
   * the document and then appeared in **no** service, data note, or design line,
   * and nothing in the pipeline noticed. The gap is surfaced rather than repaired
   * — inventing a service to close it would move complexity → effort → **the
   * price**, which is not a correction to make on the owner's behalf.
   */
  uncoveredRequirements?: string[];
}

// ── deterministic design checks (pure) ───────────────────────────────────────

/**
 * Words too generic to prove a design covers a requirement.
 *
 * Two groups. The originals are generic *nouns* ("system", "data", "module").
 * The second group is quality *adjectives* and filler verbs ("fast", "reliable",
 * "handles", "provides"): these earn their place because coverage now also reads
 * tech-stack and build-vs-buy rationales, which are written in exactly that
 * marketing register ("Typed and fast", "reliable and scalable"). Letting "fast"
 * count as coverage would let a tech rationale silently clear an unrelated
 * requirement that merely used the word — a false negative, and losing a real gap
 * is the failure this check must avoid above all. A capability is proved by its
 * nouns (payment, encryption, inventory), never by an adjective.
 */
const COVERAGE_STOP_WORDS = new Set([
  'system', 'user', 'users', 'data', 'service', 'services',
  'manage', 'management', 'support', 'provide', 'provides', 'basic', 'general',
  'information', 'application', 'platform', 'feature', 'module',
  // quality adjectives / filler that denote no capability
  'fast', 'simple', 'reliable', 'scalable', 'secure', 'robust', 'modern',
  'flexible', 'seamless', 'efficient', 'easy', 'quick', 'powerful',
  'lightweight', 'standard', 'popular', 'handle', 'handles', 'using',
  'built', 'enable', 'enables', 'allow', 'allows', 'solution', 'stack',
]);

/** How many alternative processors to name in a single recommendation line. */
const MAX_SUGGESTED_PROVIDERS = 3;

/** Names that mark a service as the identity/access component. */
const AUTH_SERVICE_PATTERN =
  /\b(auth|authentication|authorization|identity|iam|account|accounts|user|users|rbac|access|login|session|member|permission)/i;

/**
 * Reduce a word to a crude stem so morphological variants match.
 *
 * The coverage check compares exact tokens, and that alone produced the reported
 * false positives: "Simple **payment** **processing**" shares no exact token with
 * "**Processes** **payments**…", and "Role-based access control" shares none with
 * "…RBAC enforcement for all **roles**" — `payment` ≠ `payments`, `processing` ≠
 * `processes`, `role` ≠ `roles`. Both are obviously the same capability worded
 * differently, which is precisely what this feature must not flag.
 *
 * Deliberately conservative: it only folds plurals and the common verb endings
 * (-ing/-ed), leaves short words (≤4) alone, and keeps a sibilant "-es" (so
 * "processes" → "process", not "process" → "proces"). It is NOT a full stemmer;
 * over-stemming would collapse unrelated words and manufacture *coverage*, which
 * is the recall-losing direction this check must avoid.
 */
function stem(token: string): string {
  if (token.length <= 4) return token;
  if (/(?:ss|sh|ch|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Distinctive, stemmed tokens for coverage comparison. */
function coverageTokens(text: string): string[] {
  return significantTokens(text, COVERAGE_STOP_WORDS).map(stem);
}

/**
 * Functional requirements that no part of the design appears to cover.
 *
 * Matching is intentionally generous — a requirement counts as covered when a
 * coverage source shares **one** distinctive (stemmed) word with it. This is the
 * opposite calibration to the review's scope-integrity check (which demands two),
 * and for the opposite reason: there, a false positive tells an owner their own
 * document contradicts itself; here, a false positive tells them a requirement is
 * unbuilt when it is merely worded differently. A missed gap falls through to the
 * LLM verification pass in the agent, so generosity is the cheap direction.
 *
 * Coverage is NOT services-only. A requirement can be satisfied by a technology
 * choice or a build-vs-buy decision rather than a named service — "data
 * encryption" is owned by "Aurora encryption at rest / TLS 1.3", not by a
 * service — so the caller passes those lines in `extraCoverage`. This is the
 * deterministic FIRST pass; genuine synonymy the token match still misses (e.g.
 * "login" vs "authentication") is caught by the agent's LLM verification of
 * whatever survives here.
 */
export function findUncoveredRequirements(
  functional: FunctionalRequirement[] | undefined,
  services: ServiceModule[] | undefined,
  extraCoverage: string[] = [],
): string[] {
  const haystacks = [
    ...(services ?? []).map((svc) =>
      coverageTokens(`${svc.name} ${svc.responsibility}`),
    ),
    ...extraCoverage.map((line) => coverageTokens(line)),
  ];

  return (functional ?? [])
    .filter((fr) => {
      const tokens = coverageTokens(`${fr.title} ${fr.description}`);
      // A requirement with no distinctive words of its own cannot be judged —
      // treat it as covered rather than report an unprovable gap.
      if (tokens.length === 0) return false;
      return !haystacks.some((source) => source.some((w) => tokens.includes(w)));
    })
    .map((fr) => fr.id);
}

/**
 * Non-service coverage sources: the technology choices and build-vs-buy
 * decisions that can address a requirement without a dedicated service owning it.
 *
 * Passed to `findUncoveredRequirements` as `extraCoverage` so a concern satisfied
 * at the infrastructure level — "data encryption" by "Aurora encryption at rest /
 * TLS 1.3", say — is recognised rather than flagged as if nothing addressed it.
 * NFRs are deliberately excluded here: they are requirement text, not design
 * decisions, and matching a functional requirement to an unrelated NFR on a
 * shared generic word would manufacture coverage. The LLM verification pass reads
 * the NFRs semantically instead.
 */
export function coverageSourcesFromDesign(design: {
  techStack?: TechChoice[];
  buildVsBuy?: BuildVsBuyItem[];
}): string[] {
  return [
    ...(design.techStack ?? []).map(
      (t) => `${t.layer} ${t.technology} ${t.rationale}`,
    ),
    ...(design.buildVsBuy ?? []).map(
      (b) => `${b.capability} ${b.suggestedService ?? ''} ${b.rationale} ${b.impact}`,
    ),
  ];
}

/** True when the design already has a service that owns identity/access. */
export function hasAuthService(services: ServiceModule[] | undefined): boolean {
  return (services ?? []).some(
    (svc) =>
      AUTH_SERVICE_PATTERN.test(svc.name) ||
      AUTH_SERVICE_PATTERN.test(svc.responsibility),
  );
}

/**
 * The identity service a multi-role project always needs, or `null` when the
 * requirements imply no access control or the design already has one.
 *
 * A design that defines several roles with different permissions — and an NFR
 * about preventing unauthorized access — but ships no component that
 * authenticates anyone is incomplete in a way every downstream stage inherits:
 * the API design has nothing to guard, and the threat model reports "broken
 * access control" in the abstract because it is reading an artifact with no
 * access control in it.
 */
export function missingAuthService(
  services: ServiceModule[] | undefined,
  roles: UserRole[] | undefined,
): ServiceModule | null {
  if ((roles?.length ?? 0) < 2) return null;
  if (hasAuthService(services)) return null;

  const names = (roles ?? []).map((r) => r.name).filter(Boolean);
  return {
    name: 'Auth Service',
    responsibility: `Authenticates users and enforces role-based permissions across ${
      names.length ? names.join(', ') : 'the defined roles'
    }.`,
    dependencies: [],
    complexity: 'M',
    complexityRationale: `${names.length} distinct roles with different permissions.`,
  };
}

/**
 * Correct a payments recommendation that names a processor the client cannot
 * actually use, and report whether anything changed.
 *
 * The model reaches for Stripe regardless of who the merchant is — it dominates
 * the training data — and a scoping document that recommends a processor which
 * will refuse the client's signup is wrong in the way that costs the dev shop the
 * meeting. The correction is a **table lookup, not a judgement** (the
 * `regulationsForMarket` precedent), and it never invents availability: an
 * unrecognized market leaves the recommendation exactly as it was.
 */
export function enforcePaymentAvailability(
  items: BuildVsBuyItem[] | undefined,
  targetMarket: string | undefined | null,
): { items: BuildVsBuyItem[]; corrected: boolean } {
  const availability = paymentAvailabilityFor(targetMarket);
  const list = items ?? [];
  if (!availability) return { items: list, corrected: false };

  let corrected = false;
  const next = list.map((item) => {
    if (item.capability !== 'payments' || item.recommendation !== 'buy') return item;

    const named = availability.unavailable.filter((provider) =>
      new RegExp(`\\b${escapeRegExp(provider)}\\b`, 'i').test(
        `${item.suggestedService ?? ''} ${item.rationale}`,
      ),
    );
    if (named.length === 0) return item;

    corrected = true;
    // Capped: the full list is prompt material, but a `suggestedService` reading
    // "A or B or C or D or E or F or G" is not a recommendation, it is a menu —
    // and this field is rendered as one line in a document a client reads.
    const viable = paymentProvidersFor(targetMarket).slice(0, MAX_SUGGESTED_PROVIDERS);
    return {
      ...item,
      suggestedService: viable.join(' or '),
      rationale: `${stripProviders(item.rationale, named)} ${availability.note}`.trim(),
    };
  });

  return { items: next, corrected };
}

/**
 * Remove a now-wrong provider name from model prose.
 *
 * The sentence is kept — it usually carries a real argument ("buying is cheaper
 * than building a processor") that survives the substitution; only the name that
 * would mislead the client is dropped.
 */
function stripProviders(text: string, providers: string[]): string {
  let out = text;
  for (const provider of providers) {
    out = out.replace(
      new RegExp(`\\s*\\b(?:like|such as|e\\.g\\.?)?\\s*${escapeRegExp(provider)}\\b`, 'gi'),
      '',
    );
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
