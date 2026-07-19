import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  isBuildVsBuyCapability,
  isModuleComplexity,
  regulationsForMarket,
  significantTokens,
  type ArchitectureType,
  type BuildVsBuyItem,
  type BuildVsBuyRecommendation,
  type ConstraintCompliance,
  type IntentAnalysis,
  type ModuleComplexity,
  type PhasedArchitecture,
  type RequirementDocument,
  type ServiceModule,
  type SlotKey,
  type SlotMap,
  type SystemDesign,
  type TechChoice,
  untrustedField,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';
import { splitSlotList } from '../../interview/slots';

/** What the System Architect needs from the upstream stages. */
export interface SystemDesignContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  /**
   * The interview's slot snapshot (R6). Grounds the design in the deal's
   * constraints (budget, timeline, scale, existing assets). Possibly absent on
   * legacy/plan-mode runs — every reader tolerates that.
   */
  slots?: SlotMap;
}

/**
 * Owns the System Design stage: recommends an architecture type, a tech stack,
 * a service breakdown, a build-vs-buy analysis, per-module complexity, and (when
 * scale conflicts with budget/timeline) a phased plan. LLM-driven with a
 * deterministic fallback derived from the requirements + constraint slots so the
 * stage always yields a valid, constraint-grounded design.
 */
@Injectable()
export class SystemArchitectAgent extends BaseAgent {
  readonly role = AgentRole.SystemArchitect;

  protected readonly systemPrompt = [
    'You are a pragmatic Staff System Architect scoping a build for a small',
    'software house bidding on client work. From a requirement document and the',
    "client's stated constraints you recommend an architecture, a technology",
    'stack, a service breakdown, and a build-vs-buy plan a team could start from.',
    'Method: choose the SIMPLEST architecture that satisfies the requirements —',
    'default to a modular monolith and only reach for microservices when real',
    'scale, team, or independent-deployment signals justify the operational cost.',
    'Ground every major decision in the constraints: when a budget or timeline is',
    'stated, cite it, prefer managed services over self-hosted, and NAME the',
    'rejected alternative and why it loses under these constraints (time, money,',
    'team size). For each standard capability the requirements imply (auth,',
    'payments, notifications, file storage, maps/geo, search), decide build vs buy',
    'and name a concrete, well-known service when buying.',
    'Output standard: every rationale cites a concrete driver (a load target, a',
    'stated constraint, a data shape) — never generic "it is popular" reasoning.',
    'Refer to budget/timeline qualitatively (e.g. "the tight timeline"); do NOT',
    'restate the exact figure or date. Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: SystemDesignContext,
  ): Promise<SystemDesign> {
    const generatedAt = new Date().toISOString();
    return this.generateArtifact<SystemDesign>({
      label: 'System design',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) => this.normalize(sessionId, generatedAt, raw, ctx),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
    });
  }

  private buildPrompt(ctx: SystemDesignContext): string {
    const fr = ctx.requirements.functional
      .map((f) => `- ${f.id} (${f.priority}): ${f.title}`)
      .join('\n');
    const nfr = ctx.requirements.nonFunctional
      .map((n) => `- ${n.category}: ${n.description}`)
      .join('\n');
    const s = ctx.slots;
    return [
      untrustedField('Idea', ctx.idea),
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      'Functional requirements:',
      fr,
      'Non-functional requirements (these drive the architecture):',
      nfr || '- none stated',
      `Constraints: ${ctx.requirements.constraints.join('; ') || 'none'}`,
      '',
      'Client constraints from the interview (may be empty — tolerate):',
      `- Budget: ${slotText(s, 'budget_range') || 'not stated'}`,
      `- Timeline: ${slotText(s, 'timeline') || 'not stated'}`,
      `- Expected scale: ${slotText(s, 'scale_expectations') || 'not stated'}`,
      `- Hard constraints: ${slotText(s, 'constraints') || 'none stated'}`,
      `- Existing assets to build on: ${slotText(s, 'existing_assets') || 'none stated'}`,
      `- Target market: ${slotText(s, 'target_market') || 'not stated'}`,
      residencyLine(slotText(s, 'target_market')),
      '',
      'Rules:',
      '- Pick the simplest architecture that meets the requirements. Under a tight',
      '  budget or timeline, prefer a modular monolith over microservices and',
      '  managed services over self-hosted — and say so in the rationale.',
      "- Every major decision's rationale references the relevant constraint when",
      '  one exists, and names the rejected alternative and why it loses.',
      '- Conflict rule: if the interview states LARGE scale AND a tight budget or',
      '  timeline, do NOT silently pick one side — output phasedArchitecture',
      '  {mvp, growthPath, migrationNotes}. Otherwise OMIT phasedArchitecture.',
      '- Budget and timeline are context for your reasoning only; do not print the',
      '  exact figure or date in any field.',
      '',
      'Return JSON with these keys:',
      '- architecture: one of monolith | modular_monolith | microservices.',
      '- architectureRationale: why this style fits THESE requirements + constraints (cite the driver, name the rejected alternative).',
      '- techStack[]: {layer (e.g. backend, frontend, database, cache, queue, auth), technology (a specific product/framework), rationale (tied to a requirement/constraint)}.',
      '- services[]: {name, responsibility (one sentence), dependencies[] (names of other services it calls), complexity (S|M|L|XL — rough build effort), complexityRationale (one line)}.',
      '- buildVsBuy[]: {capability (one of auth|payments|notifications|file_storage|maps_geo|search), recommendation (build|buy), suggestedService (a concrete well-known service, when buying), rationale, impact (time/cost/risk)} — cover the capabilities this project needs.',
      '- constraintCompliance[]: {constraint, howAddressed} for each stated constraint (empty array if none).',
      '- phasedArchitecture (ONLY on the scale-vs-budget/timeline conflict): {mvp, growthPath, migrationNotes}.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private isValid(value: Partial<SystemDesign> | null): boolean {
    return (
      !!value &&
      typeof value.architecture === 'string' &&
      Array.isArray(value.techStack) &&
      value.techStack.length > 0 &&
      Array.isArray(value.services) &&
      value.services.length > 0
    );
  }

  // ── LLM-path normalization ─────────────────────────────────────────────────

  /**
   * Trust a conforming LLM design but guarantee the R8 shape: every module gets
   * a complexity; build-vs-buy / constraint-compliance are sanitized (unknown
   * capabilities dropped) and backfilled deterministically when empty; and
   * phasedArchitecture is present iff the (deterministic) scale-vs-constraint
   * conflict holds — so its presence is a testable function of the inputs.
   */
  private normalize(
    sessionId: string,
    generatedAt: string,
    raw: Partial<SystemDesign>,
    ctx: SystemDesignContext,
  ): SystemDesign {
    const haystack = this.haystack(ctx);
    const services = this.ensureComplexity(
      raw.services as ServiceModule[],
      ctx,
    );
    const buildVsBuy = sanitizeBuildVsBuy(raw.buildVsBuy);
    const compliance = sanitizeCompliance(raw.constraintCompliance);
    const conflict = this.hasScaleConflict(ctx, haystack);

    return {
      ...(raw as SystemDesign),
      sessionId,
      generatedAt,
      services,
      buildVsBuy: buildVsBuy.length ? buildVsBuy : this.buildVsBuy(haystack),
      constraintCompliance: compliance.length
        ? compliance
        : this.constraintCompliance(ctx),
      phasedArchitecture: conflict
        ? validPhased(raw.phasedArchitecture) ?? this.phasedArchitecture(ctx)
        : undefined,
    };
  }

  private ensureComplexity(
    services: ServiceModule[],
    ctx: SystemDesignContext,
  ): ServiceModule[] {
    return services.map((svc) => {
      if (svc.complexity && isModuleComplexity(svc.complexity)) {
        return {
          ...svc,
          complexityRationale:
            svc.complexityRationale?.trim() || this.complexityFor(svc, ctx).rationale,
        };
      }
      const { complexity, rationale } = this.complexityFor(svc, ctx);
      return { ...svc, complexity, complexityRationale: rationale };
    });
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: SystemDesignContext,
  ): SystemDesign {
    const haystack = this.haystack(ctx);
    const architecture = this.inferArchitecture(haystack, ctx.slots);
    const services = this.inferServices(haystack, ctx).map((svc) => {
      const { complexity, rationale } = this.complexityFor(svc, ctx);
      return { ...svc, complexity, complexityRationale: rationale };
    });
    const conflict = this.hasScaleConflict(ctx, haystack);

    return {
      sessionId,
      generatedAt,
      architecture,
      architectureRationale: this.architectureRationale(architecture, ctx, conflict),
      techStack: this.inferTechStack(haystack),
      services,
      buildVsBuy: this.buildVsBuy(haystack),
      constraintCompliance: this.constraintCompliance(ctx),
      phasedArchitecture: conflict ? this.phasedArchitecture(ctx) : undefined,
    };
  }

  /** Lowercased blob of requirement + safe-slot text for keyword inference. */
  private haystack(ctx: SystemDesignContext): string {
    const r = ctx.requirements;
    // Budget/timeline/scale slots are deliberately EXCLUDED — a budget like
    // "we can pay $5k" would otherwise trip the payments/maps keyword detectors.
    const slotContext = (['business_domain', 'core_workflows', 'data_entities', 'integrations', 'existing_assets'] as SlotKey[])
      .map((k) => slotText(ctx.slots, k))
      .filter(Boolean);
    return [
      ctx.idea,
      ...r.functional.map((f) => `${f.title} ${f.description}`),
      ...r.nonFunctional.map((n) => n.description),
      ...r.constraints,
      ...slotContext,
    ]
      .join(' ')
      .toLowerCase();
  }

  private inferArchitecture(
    text: string,
    slots: SlotMap | undefined,
  ): ArchitectureType {
    if (/micro-?service/.test(text)) return 'microservices';
    // Bias: a tight budget/timeline pins us to the simplest deployable, even if
    // scale words appear — the phased plan captures the growth path instead.
    if (budgetIsTight(slots) || timelineIsTight(slots)) return 'modular_monolith';
    if (/(enterprise|millions of users|high scale|globally)/.test(text)) {
      return 'microservices';
    }
    return 'modular_monolith';
  }

  private architectureRationale(
    arch: ArchitectureType,
    ctx: SystemDesignContext,
    conflict: boolean,
  ): string {
    const parts: string[] = [];
    if (arch === 'microservices') {
      parts.push(
        'The stated scale and independent-deployment signals justify splitting into services so hot paths can scale and deploy on their own.',
      );
      parts.push(
        'A modular monolith is rejected here: it would force the whole system to scale as one unit when the requirements point to independent scaling.',
      );
    } else if (arch === 'monolith') {
      parts.push(
        'A single deployable is the smallest possible footprint for an early MVP — one codebase, one pipeline, no distributed-systems tax.',
      );
    } else {
      parts.push(
        'A modular monolith is the simplest architecture that meets these requirements: one codebase and one deployment, with enforced module seams for a later split.',
      );
      const drivers = tightDrivers(ctx.slots);
      if (drivers) {
        parts.push(
          `Given the ${drivers}, microservices are rejected here — their per-service CI/CD, observability, and infrastructure would cost more time and money than a small team can spare at this stage.`,
        );
      } else {
        parts.push(
          'Microservices are rejected for now: they add distributed-systems overhead the current scale does not justify.',
        );
      }
    }
    if (conflict) {
      parts.push(
        'Because the stated scale ambitions run ahead of the initial budget/timeline, a phased plan is provided below rather than over-building on day one.',
      );
    }
    return parts.join(' ');
  }

  private inferTechStack(text: string): TechChoice[] {
    const preferNoSql = /nosql|mongo|document db/.test(text);
    const stack: TechChoice[] = [
      {
        layer: 'backend',
        technology: 'NestJS (TypeScript)',
        rationale: 'Modular, DI-based framework that maps cleanly to services.',
      },
      {
        layer: 'frontend',
        technology: 'Next.js (React)',
        rationale: 'SSR-capable React framework for the web client.',
      },
      {
        layer: 'database',
        technology: preferNoSql ? 'MongoDB' : 'PostgreSQL',
        rationale: preferNoSql
          ? 'Document model requested in the requirements.'
          : 'Relational integrity for transactional data (default).',
      },
      {
        layer: 'auth',
        technology: 'JWT + refresh tokens',
        rationale: 'Stateless auth suitable for API + SPA.',
      },
    ];
    if (/(notification|email|sms|async|queue|report)/.test(text)) {
      stack.push({
        layer: 'queue',
        technology: 'BullMQ + Redis',
        rationale: 'Background jobs for notifications and async processing.',
      });
    }
    return stack;
  }

  /**
   * The service breakdown for the offline path.
   *
   * The generic services below are keyword-triggered and were once the whole
   * list — which meant this fallback produced `Auth · Users · Billing ·
   * Notifications · Reporting` for **every** project, no matter what it was. A
   * fashion store and a clinic system got byte-identical service lists, and the
   * domain of the actual product (catalog, orders, inventory) appeared nowhere.
   *
   * Domain services are therefore derived from the things the system stores —
   * the `data_entities` slot, falling back to the entity nouns in the functional
   * requirements — and inserted directly after the account services, which is
   * where a reader looks for the substance of the design.
   */
  private inferServices(text: string, ctx: SystemDesignContext): ServiceModule[] {
    const services: ServiceModule[] = [
      {
        name: 'Auth',
        responsibility: 'Authentication, authorization, tokens, sessions.',
        dependencies: ['Users'],
      },
      {
        name: 'Users',
        responsibility: 'User accounts, roles, and profiles.',
        dependencies: [],
      },
    ];
    services.push(...this.domainServices(ctx, services));
    if (/(payment|billing|invoice|subscription|checkout)/.test(text)) {
      services.push({
        name: 'Billing',
        responsibility: 'Payments, invoices, and subscriptions.',
        dependencies: ['Users'],
      });
    }
    if (/(notification|email|sms|alert)/.test(text)) {
      services.push({
        name: 'Notifications',
        responsibility: 'Email/SMS/in-app notifications and delivery.',
        dependencies: ['Users'],
      });
    }
    if (/(report|dashboard|analytic|metric)/.test(text)) {
      services.push({
        name: 'Reporting',
        responsibility: 'Reports, dashboards, and analytics.',
        dependencies: ['Users'],
      });
    }
    return services;
  }

  /**
   * Domain services derived from the entities this system actually stores.
   *
   * Entities are read from the `data_entities` slot first (the client's own list)
   * and from the functional requirements when that slot went unfilled. Anything a
   * generic service already owns is skipped, so a "User" entity does not produce a
   * `Users` service beside the one that is always present.
   */
  private domainServices(
    ctx: SystemDesignContext,
    existing: ServiceModule[],
  ): ServiceModule[] {
    // Shortest names first, so a parent entity ("Product") is accepted before its
    // dependent ("Product Variant") and therefore absorbs it — see `belongsTo`.
    // Ties keep the client's original ordering, so the result stays deterministic.
    const entities = this.entityNames(ctx)
      .map((name, index) => ({ name, index }))
      .sort(
        (a, b) =>
          a.name.split(' ').length - b.name.split(' ').length || a.index - b.index,
      )
      .map((e) => e.name);

    const taken = new Set(existing.map((s) => s.name.toLowerCase()));
    const accepted: string[] = [];
    const out: ServiceModule[] = [];

    for (const entity of entities) {
      const name = pluralize(titleCase(entity));
      const key = name.toLowerCase();
      if (!name || taken.has(key) || GENERIC_SERVICE_NOUNS.test(key)) continue;
      // A dependent record is part of its parent's module, not a module of its
      // own: "Order Item" is owned by Orders, and splitting it out would ship a
      // service per table instead of a service per capability.
      if (accepted.some((owner) => belongsTo(entity, owner))) continue;
      taken.add(key);
      accepted.push(entity);
      out.push({
        name,
        responsibility: `Records, lifecycle rules, and the operations the workflow performs on ${name.toLowerCase()}.`,
        dependencies: [],
      });
      if (out.length >= MAX_DOMAIN_SERVICES) break;
    }
    return out;
  }

  /** Candidate entity nouns: the data-entities slot, else requirement titles. */
  private entityNames(ctx: SystemDesignContext): string[] {
    const slot = ctx.slots?.data_entities;
    const fromSlot =
      slot && !slot.na ? splitSlotList(slot.value).map(entityHead) : [];
    if (fromSlot.filter(Boolean).length) return fromSlot.filter(Boolean);

    return ctx.requirements.functional
      .map((f) => entityHead(f.title))
      .filter(Boolean);
  }

  // ── R8 deterministic builders ───────────────────────────────────────────

  /**
   * Build-vs-buy items for the standard capabilities this project implies. Auth
   * is always included — every app in scope here has accounts/roles, and role
   * names ("Customer", "Provider") don't reliably surface as auth keywords.
   */
  private buildVsBuy(haystack: string): BuildVsBuyItem[] {
    return BUILD_VS_BUY_TABLE.filter(
      (e) => e.capability === 'auth' || e.applies.test(haystack),
    ).map((e) => ({ capability: e.capability, ...e.item }));
  }

  /** Coarse build effort for a module: related-requirement count + fan-out + domain. */
  private complexityFor(
    svc: ServiceModule,
    ctx: SystemDesignContext,
  ): { complexity: ModuleComplexity; rationale: string } {
    const related = relatedRequirementCount(svc, ctx.requirements.functional);
    const deps = svc.dependencies.length;
    const domain = domainWeight(svc.name);
    const weight = related + deps + domain;
    const complexity: ModuleComplexity =
      weight >= 6 ? 'XL' : weight >= 4 ? 'L' : weight >= 2 ? 'M' : 'S';
    const rationale =
      `${related} related requirement${related === 1 ? '' : 's'}, ` +
      `${deps} dependenc${deps === 1 ? 'y' : 'ies'}` +
      (domain > 0 ? '; an inherently involved domain.' : '.');
    return { complexity, rationale };
  }

  /** Passthrough of the stated constraints (slots + requirements) with how each is met. */
  private constraintCompliance(ctx: SystemDesignContext): ConstraintCompliance[] {
    const fromSlot = splitConstraints(slotText(ctx.slots, 'constraints'));
    const all = dedupeStrings([...fromSlot, ...ctx.requirements.constraints]);
    return all.map((constraint) => ({
      constraint,
      howAddressed: howAddressed(constraint),
    }));
  }

  private phasedArchitecture(ctx: SystemDesignContext): PhasedArchitecture {
    const scale = slotText(ctx.slots, 'scale_expectations');
    const scaleNote = scale ? ` toward the stated scale (${scale})` : '';
    return {
      mvp: 'Ship a modular monolith covering the core flows on one deployment with a managed database and hosting — the fastest path to a working product within the current budget and timeline.',
      growthPath: `As real load grows${scaleNote}, extract the highest-traffic modules into independently deployable services and add caching, read replicas, and async processing where the numbers demand it.`,
      migrationNotes:
        'Keep inter-module calls behind clear interfaces from day one so an extraction is a deployment change, not a rewrite; split out a module only once its load or team ownership genuinely warrants the operational cost.',
    };
  }

  /** The conflict test: stated large scale AND a tight budget/timeline. */
  private hasScaleConflict(ctx: SystemDesignContext, haystack: string): boolean {
    return (
      scaleIsLarge(ctx.slots, haystack) &&
      (budgetIsTight(ctx.slots) || timelineIsTight(ctx.slots))
    );
  }
}

// ── module-level pure helpers ─────────────────────────────────────────────

function slotText(slots: SlotMap | undefined, key: SlotKey): string {
  const s = slots?.[key];
  return s && !s.na ? s.value.trim() : '';
}

/**
 * The hosting-region line for the prompt. Where data may legally live is an
 * architecture decision (it constrains the provider and the region), so the
 * architect is told the residency expectation rather than left to infer one from
 * the market name — or, with no market stated, told explicitly not to assume.
 */
function residencyLine(market: string): string {
  const regime = regulationsForMarket(market);
  return regime
    ? `- Data residency: ${regime.dataResidency} Name the hosting region in the rationale.`
    : '- Data residency: no target market stated — do not assume a jurisdiction or a default hosting region.';
}

const LARGE_SCALE =
  /(million|100[\s,]?000|10[\s,]?000|enterprise|nationwide|global|worldwide|high[- ]?scale|high traffic|large[- ]?scale|massive|viral)/i;
const TIGHT_BUDGET =
  /(low|tight|limited|small|minimal|bootstrap|shoestring|cheap|lean|under|less than|\bmvp\b|constrained)/i;
const TIGHT_TIMELINE =
  /(asap|urgent|rush|tight|fast|quick|soon|\bdays?\b|[1-3]\s?weeks?|[1-3]\s?months?|deadline|\bmvp\b|yesterday)/i;
// A "relaxed" signal negates the tight-keyword match — "no rush"/"flexible" would
// otherwise trip on the "rush"/"tight" substrings inside them.
const RELAXED =
  /(flexible|relaxed|generous|no rush|not urgent|no deadline|no hard deadline|open[- ]?ended|whenever|no time pressure|no budget (constraint|limit)|plenty of|ample|not tight)/i;

/** True when any number ≥ 10,000 appears (catches numeric figures the word list misses). */
function hasLargeNumber(text: string): boolean {
  const matches = text.match(/\d[\d,]*/g);
  return !!matches && matches.some((m) => Number(m.replace(/,/g, '')) >= 10000);
}

function scaleIsLarge(slots: SlotMap | undefined, haystack: string): boolean {
  const scale = slotText(slots, 'scale_expectations');
  return (
    LARGE_SCALE.test(scale) || hasLargeNumber(scale) || LARGE_SCALE.test(haystack)
  );
}

function budgetIsTight(slots: SlotMap | undefined): boolean {
  const b = slotText(slots, 'budget_range');
  return !!b && !RELAXED.test(b) && TIGHT_BUDGET.test(b);
}

function timelineIsTight(slots: SlotMap | undefined): boolean {
  const t = slotText(slots, 'timeline');
  return !!t && !RELAXED.test(t) && TIGHT_TIMELINE.test(t);
}

/** "tight budget", "tight timeline", or both — for the rationale text. */
function tightDrivers(slots: SlotMap | undefined): string {
  const drivers = [
    budgetIsTight(slots) ? 'tight budget' : '',
    timelineIsTight(slots) ? 'tight timeline' : '',
  ].filter(Boolean);
  return drivers.join(' and ');
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  'user',
  'users',
  'data',
  'system',
  'manage',
  'management',
  'service',
  'provide',
  'support',
  'allow',
  'their',
  'with',
  'that',
  'this',
  'from',
]);

function relatedRequirementCount(
  svc: ServiceModule,
  functional: RequirementDocument['functional'],
): number {
  const tokens = significantTokens(`${svc.name} ${svc.responsibility}`, STOP_WORDS);
  if (!tokens.length) return 0;
  return functional.filter((fr) => {
    const text = `${fr.title} ${fr.description}`.toLowerCase();
    return tokens.some((tkn) => text.includes(tkn));
  }).length;
}

/** Domains that are intrinsically heavier regardless of requirement count. */
function domainWeight(name: string): number {
  const n = name.toLowerCase();
  if (/(payment|billing|checkout|invoice|payout|wallet)/.test(n)) return 3;
  if (/(search|geo|map|route|track|realtime|chat|stream|matching)/.test(n)) return 2;
  if (/(auth|notif|report|analytic|integration|booking)/.test(n)) return 1;
  return 0;
}

function splitConstraints(text: string): string[] {
  // Split on ; / newlines AND sentence boundaries (period + whitespace) so a
  // period-separated slot ("Must use PostgreSQL. Must host in the EU.") yields
  // one row per constraint. A decimal ("15.4 GB") has no space after the dot, so
  // it stays intact.
  return text
    .split(/[;\n]+|\.\s+/)
    .map((s) => s.trim().replace(/\.$/, '').trim())
    .filter(Boolean);
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function howAddressed(constraint: string): string {
  const t = constraint.toLowerCase();
  if (/(postgres|mysql|sql|nosql|mongo|react|node|python|java|\.net|php|framework|stack|language|typescript)/.test(t)) {
    return 'Reflected in the tech-stack selection above.';
  }
  if (/(host|region|cloud|on[- ]?prem|residency|gdpr|hipaa|pci|complian|encrypt|security|privacy)/.test(t)) {
    return 'Addressed in the deployment target and data-handling choices.';
  }
  if (/(deadline|launch|time|month|week|budget|cost|cheap)/.test(t)) {
    return 'Shapes the phased scope and the simplest-viable architecture chosen above.';
  }
  return 'Carried into the design as a hard constraint and reflected in the architecture above.';
}

/** Keep only well-formed build-vs-buy items with a known capability. */
function sanitizeBuildVsBuy(raw: unknown): BuildVsBuyItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BuildVsBuyItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const capability = typeof r.capability === 'string' ? r.capability : '';
    const recommendation = r.recommendation;
    if (
      !isBuildVsBuyCapability(capability) ||
      seen.has(capability) ||
      (recommendation !== 'build' && recommendation !== 'buy')
    ) {
      continue;
    }
    seen.add(capability);
    out.push({
      capability,
      recommendation: recommendation as BuildVsBuyRecommendation,
      suggestedService:
        typeof r.suggestedService === 'string' && r.suggestedService.trim()
          ? r.suggestedService.trim()
          : undefined,
      rationale: typeof r.rationale === 'string' ? r.rationale : '',
      impact: typeof r.impact === 'string' ? r.impact : '',
    });
  }
  return out;
}

function sanitizeCompliance(raw: unknown): ConstraintCompliance[] {
  if (!Array.isArray(raw)) return [];
  const out: ConstraintCompliance[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const constraint = typeof r.constraint === 'string' ? r.constraint.trim() : '';
    const how = typeof r.howAddressed === 'string' ? r.howAddressed.trim() : '';
    if (constraint && how) out.push({ constraint, howAddressed: how });
  }
  return out;
}

function validPhased(raw: unknown): PhasedArchitecture | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const mvp = typeof r.mvp === 'string' ? r.mvp.trim() : '';
  const growthPath = typeof r.growthPath === 'string' ? r.growthPath.trim() : '';
  const migrationNotes =
    typeof r.migrationNotes === 'string' ? r.migrationNotes.trim() : '';
  if (!mvp || !growthPath || !migrationNotes) return undefined;
  return { mvp, growthPath, migrationNotes };
}

/** The static build-vs-buy knowledge table (deterministic — no LLM). */
const BUILD_VS_BUY_TABLE: Array<{
  capability: BuildVsBuyItem['capability'];
  applies: RegExp;
  item: Omit<BuildVsBuyItem, 'capability'>;
}> = [
  {
    capability: 'auth',
    applies: /(auth|login|sign[- ]?in|sign[- ]?up|account|role|permission|user)/,
    item: {
      recommendation: 'build',
      rationale:
        'Email/password with JWT + refresh tokens is a solved problem with mature, free libraries; a managed identity provider is only worth buying for enterprise SSO/SAML or heavy social login.',
      impact:
        'Build: a few days and no per-user fee. Buy (Auth0, Clerk, Cognito) trades that for per-active-user pricing.',
    },
  },
  {
    capability: 'payments',
    applies: /(payment|billing|checkout|invoice|subscription|payout|wallet|\bpay\b|charge|pricing)/,
    item: {
      recommendation: 'buy',
      suggestedService: 'Stripe (or a regional payment processor)',
      rationale:
        'Never build a payment processor — PCI scope, fraud handling, and payouts are enormous liabilities. A PSP keeps card data off your servers.',
      impact:
        'Buy: removes months of PCI/compliance work; cost is roughly 2.9% + a fixed fee per transaction.',
    },
  },
  {
    capability: 'notifications',
    applies: /(notification|email|sms|push|remind|alert|verify|otp)/,
    item: {
      recommendation: 'buy',
      suggestedService:
        'Resend/SendGrid (email), Twilio (SMS), Firebase Cloud Messaging (push)',
      rationale:
        'Deliverability, IP warm-up, and templating are a specialty; a transactional provider gets reliable delivery from day one.',
      impact:
        'Buy: avoids deliverability tuning; pay per message/email above a free tier.',
    },
  },
  {
    capability: 'file_storage',
    applies: /(upload|file|image|photo|document|attachment|media|avatar|storage)/,
    item: {
      recommendation: 'buy',
      suggestedService: 'Amazon S3 or Cloudflare R2',
      rationale:
        'Object storage is a commodity — a managed store gives durability, CDN delivery, and signed URLs without running or backing up disks.',
      impact: 'Buy: no backup/replication ops; pay per GB stored plus egress.',
    },
  },
  {
    capability: 'maps_geo',
    applies: /(\bmap\b|maps|gps|location|geo|route|nearby|address|distance|delivery|tracking)/,
    item: {
      recommendation: 'buy',
      suggestedService: 'Google Maps Platform or Mapbox',
      rationale:
        'Maps, geocoding, and routing need licensed map data you cannot practically self-produce; a maps API provides it turnkey.',
      impact: 'Buy: no map-data licensing; pay per request above a free tier.',
    },
  },
  {
    capability: 'search',
    applies: /(search|filter|catalog|browse|discover|full[- ]?text|autocomplete)/,
    item: {
      recommendation: 'build',
      rationale:
        'PostgreSQL full-text search covers typical catalog/browse needs at launch; adopt a dedicated engine only when relevance or scale demands it.',
      impact:
        'Build: uses the database you already run, no extra cost. A search SaaS (Algolia, Elasticsearch, Meilisearch) adds monthly spend and ops.',
    },
  },
];

// ── domain-service naming ───────────────────────────────────────────────────

/** Ceiling on derived domain services, so a long entity list stays readable. */
const MAX_DOMAIN_SERVICES = 6;

/** Entity nouns a generic service already owns — never duplicated as a module. */
const GENERIC_SERVICE_NOUNS =
  /^(users?|accounts?|auth|roles?|permissions?|sessions?|billings?|payments?|invoices?|subscriptions?|notifications?|messages?|emails?|reports?|analytics|logs?|audit logs?|settings?)$/;

/** Words that describe an entity rather than name it. */
const ENTITY_STOP_WORDS =
  /^(the|a|an|each|every|all|main|key|core|primary|its|their|new|manage|managing|track|tracking|store|storing|handle|handling|support|supporting|create|creating)$/i;

/**
 * Shortest credible entity name. Below this the token is a placeholder or an
 * initial, and turning it into a service invents a module the design never had —
 * a stray "x" answer would otherwise ship a service module named "Xs".
 */
const MIN_ENTITY_NAME_CHARS = 3;

/**
 * The head noun of one entity line: "Product — name, description, category"
 * becomes "Product". Entity lists are the client's own words, so the descriptive
 * tail after a separator is dropped and leading filler verbs are stripped.
 * Returns '' when nothing name-like survives — the caller skips those.
 */
function entityHead(raw: string): string {
  const lead = (raw ?? '')
    .split(/[—–:(]|\s-\s/)[0]
    .replace(/[^\p{L}\p{N}\s/&_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = lead
    .split(' ')
    .filter(Boolean)
    .filter((w, i) => !(i === 0 && ENTITY_STOP_WORDS.test(w)));
  // Beyond three words it is a sentence about the entity, not the entity's name.
  const name = words.length && words.length <= 3 ? words.join(' ') : (words[0] ?? '');
  return name.replace(/\s+/g, '').length >= MIN_ENTITY_NAME_CHARS ? name : '';
}

/**
 * True when `entity` is a dependent record of the already-accepted `owner` —
 * "Order Item" belongs to "Order", "Product Variant" to "Product".
 *
 * The test is that the owner's words are a prefix of the entity's, not merely
 * present in them: a prefix match is what distinguishes a qualified child
 * ("Order Item") from an unrelated entity that happens to share a word
 * ("Inventory Log" is not owned by "Log").
 */
function belongsTo(entity: string, owner: string): boolean {
  const words = entity.toLowerCase().split(/\s+/).filter(Boolean);
  const ownerWords = owner.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length <= ownerWords.length) return false;
  return ownerWords.every((w, i) => words[i] === w);
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Naive English pluralization — service modules read as plural collections. */
function pluralize(name: string): string {
  const parts = name.split(' ');
  const last = parts[parts.length - 1] ?? '';
  if (!last) return name;
  if (/(s|x|z|ch|sh)$/i.test(last)) parts[parts.length - 1] = `${last}es`;
  else if (/[^aeiou]y$/i.test(last)) {
    parts[parts.length - 1] = `${last.slice(0, -1)}ies`;
  } else if (!/s$/i.test(last)) parts[parts.length - 1] = `${last}s`;
  return parts.join(' ');
}
