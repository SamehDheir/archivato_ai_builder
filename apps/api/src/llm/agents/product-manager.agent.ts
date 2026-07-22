import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  resolveServiceTargets,
  serviceTargetInput,
  serviceTargetsPromptBlock,
  serviceTargetSentence,
  type ArtifactLanguage,
  type IntentAnalysis,
  type Persona,
  type ProductVision,
  type ProjectScale,
  type RequirementsSummary,
  type ServiceTargets,
  type SlotMap,
  type SuccessMetric,
  untrustedField,
  dedupeBy,
  dedupeStrings,
  screenProductVision,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Everything the Product Manager needs — the confirmed interview's essence. */
export interface ProductVisionContext {
  idea: string;
  industry?: string;
  scale?: ProjectScale;
  intent: IntentAnalysis | null;
  summary: RequirementsSummary | null;
  /**
   * The interview's slot snapshot — the source of every figure this stage quotes.
   *
   * Its absence was the whole bug. The context was `{idea, industry, scale,
   * intent, summary}`, so the agent was asked for "measurable success metrics"
   * while holding no number the client had stated and no artifact anyone else
   * had committed to. It invented "≤1.5 seconds" while the requirement document
   * said 2 — not a sync failure, but two independent guesses, because there was
   * nothing to sync with. Optional, because legacy/plan-mode sessions carry no
   * slots and every reader here tolerates that.
   */
  slots?: SlotMap;
}

/**
 * Owns the Product Manager stage: turns the confirmed interview into a product
 * strategy — vision, goals, MVP vs. roadmap, success metrics, and personas.
 * LLM-driven with a deterministic fallback built from the interview, so the
 * stage always yields a coherent vision (mock mode + tests stay offline).
 */
@Injectable()
export class ProductManagerAgent extends BaseAgent {
  readonly role = AgentRole.ProductManager;

  protected readonly systemPrompt = [
    'You are a seasoned Product Manager shaping a new product from a confirmed',
    'discovery interview. You articulate a crisp product vision, strategic goals, a',
    'lean MVP versus a future roadmap, measurable success metrics, and concrete',
    'user personas.',
    'Method: anchor everything to the user problem and the value delivered. The MVP',
    'is the smallest coherent slice that delivers that value end-to-end — ruthless',
    'about cutting scope, honest about what waits. Goals are outcomes, not features.',
    'Success metrics are measurable and tied to product-market-fit signals',
    '(activation, retention, engagement), each with a concrete target and a reason',
    'it matters. Personas are grounded in the actual users named in the interview.',
    'Output standard: specific to THIS product (no generic startup boilerplate),',
    'outcome-oriented, and internally consistent (the MVP advances the goals; the',
    'metrics measure them). Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: ProductVisionContext,
  ): Promise<ProductVision> {
    const generatedAt = new Date().toISOString();
    // Resolved from the interview, not invented here — the same pure call the
    // Requirement Engineer and the System Architect make, so all three quote one
    // figure without any of them having to read another's artifact. The language
    // is resolved up front and passed in so this agent's targets are identical to
    // the Requirement Engineer's, derivation prose included.
    const language = await this.artifactLanguage();
    const targets = resolveServiceTargets(serviceTargetInput(ctx), language);
    const generated = await this.generateArtifact<ProductVision>({
      label: 'Product vision',
      prompt: this.buildPrompt(ctx, targets),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) =>
        this.dedupeLists({ ...(raw as ProductVision), sessionId, generatedAt }),
      fallback: (language) =>
        this.buildDeterministic(sessionId, generatedAt, ctx, targets, language),
    });

    // The vision leads the share page, so it is screened like the requirement
    // document — same untrusted source text, more prominent placement.
    const { vision, removed } = screenProductVision(generated);
    if (removed.length > 0) {
      this.logger.warn(
        `Product vision: stripped ${removed.length} link(s) — possible prompt injection: ${removed.join(', ')}`,
      );
    }
    return vision;
  }

  /**
   * Remove duplicate list entries the model may have emitted. There is no
   * read-boundary normalizer for the vision, so a repeat left here renders twice
   * on the share page the client reads. The view dedupes defensively too; this
   * keeps the stored artifact (and its JSON export) clean at the source.
   */
  private dedupeLists(vision: ProductVision): ProductVision {
    return {
      ...vision,
      goals: dedupeStrings(vision.goals ?? []),
      mvp: dedupeStrings(vision.mvp ?? []),
      futureFeatures: dedupeStrings(vision.futureFeatures ?? []),
      successMetrics: dedupeBy(vision.successMetrics ?? [], (m) => m.name),
      personas: dedupeBy(vision.personas ?? [], (p) => p.name),
    };
  }

  private buildPrompt(
    ctx: ProductVisionContext,
    targets: ServiceTargets,
  ): string {
    return [
      untrustedField('Idea', ctx.idea),
      ctx.industry ? `Industry: ${ctx.industry}` : '',
      ctx.scale ? `Scale: ${ctx.scale}` : '',
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      ctx.intent ? `Primary users: ${ctx.intent.primaryUsers.join(', ')}` : '',
      ctx.summary ? `Goal: ${ctx.summary.goal}` : '',
      ctx.summary ? `Users: ${ctx.summary.users.join(', ')}` : '',
      ctx.summary ? `Features: ${ctx.summary.features.join(', ')}` : '',
      ctx.summary?.scale?.length
        ? `Stated scale: ${ctx.summary.scale.join('; ')}`
        : '',
      '',
      serviceTargetsPromptBlock(targets),
      '',
      'Produce the product vision as JSON with these keys:',
      '- vision: one inspiring but concrete sentence — who it serves and the change it creates.',
      '- goals: 3-5 strategic outcomes (not features) the product must achieve.',
      '- mvp: the smallest end-to-end scope worth launching (list of capabilities).',
      '- futureFeatures: what is deliberately deferred to after the MVP.',
      '- successMetrics[]: {name, target (measurable), rationale (why it signals success)}.',
      '  A metric about response time, availability or user volume MUST use the',
      '  agreed figure above exactly — this list sits beside the requirement',
      '  document and the architecture in one proposal, and a different number here',
      '  reads as a second, contradictory promise. Metrics about adoption',
      '  (activation, retention, engagement) have no agreed figure: choose targets',
      '  that suit this product.',
      '- personas[]: {name, description, goals[], painPoints[]} — grounded in the real users above.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private isValid(value: Partial<ProductVision> | null): boolean {
    return (
      !!value &&
      typeof value.vision === 'string' &&
      Array.isArray(value.goals) &&
      Array.isArray(value.mvp) &&
      Array.isArray(value.futureFeatures) &&
      Array.isArray(value.successMetrics) &&
      Array.isArray(value.personas)
    );
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: ProductVisionContext,
    targets: ServiceTargets,
    language: ArtifactLanguage,
  ): ProductVision {
    const goal =
      ctx.summary?.goal || ctx.intent?.summary || ctx.idea;
    const users = this.users(ctx);
    const features = this.features(ctx);
    const { mvp, futureFeatures } = this.splitScope(features, ctx.scale);

    return {
      sessionId,
      generatedAt,
      vision: this.vision(goal, users, ctx),
      goals: this.goals(goal, features),
      mvp,
      futureFeatures,
      successMetrics: this.successMetrics(ctx, targets, language),
      personas: this.personas(users, goal),
    };
  }

  private users(ctx: ProductVisionContext): string[] {
    const users =
      ctx.summary?.users?.length
        ? ctx.summary.users
        : ctx.intent?.primaryUsers ?? [];
    const cleaned = users.map((u) => u.trim()).filter(Boolean);
    return cleaned.length ? Array.from(new Set(cleaned)) : ['End user'];
  }

  private features(ctx: ProductVisionContext): string[] {
    const features =
      ctx.summary?.features?.length
        ? ctx.summary.features
        : ctx.intent?.coreCapabilities ?? [];
    return features.map((f) => f.trim()).filter(Boolean);
  }

  private vision(
    goal: string,
    users: string[],
    ctx: ProductVisionContext,
  ): string {
    const domain = ctx.intent?.domain ? ` in ${ctx.intent.domain}` : '';
    return `Empower ${users.join(', ')} to ${this.lower(
      goal,
    )}${domain}. We deliver a focused, reliable product that removes today's manual work and scales as adoption grows.`;
  }

  private goals(goal: string, features: string[]): string[] {
    const goals = [
      `Deliver a launchable product that lets users ${this.lower(goal)}.`,
      'Make the core workflow fast, reliable, and easy to adopt.',
    ];
    if (features.length > 0) {
      goals.push(
        `Cover the essential capabilities: ${features
          .slice(0, 4)
          .join(', ')}.`,
      );
    }
    goals.push('Establish trust with a secure, well-designed foundation.');
    return goals;
  }

  /** MVP = the first must-haves; the rest become the roadmap. */
  private splitScope(
    features: string[],
    scale?: ProjectScale,
  ): { mvp: string[]; futureFeatures: string[] } {
    if (features.length === 0) {
      return {
        mvp: [
          'Core account + authentication',
          'The single most valuable workflow, end to end',
        ],
        futureFeatures: [
          'Reporting and analytics',
          'Notifications',
          'Integrations and an API',
        ],
      };
    }
    // A smaller MVP for early-stage scale; larger when enterprise.
    const cut = scale === 'enterprise' ? 5 : scale === 'startup' ? 4 : 3;
    const mvp = features.slice(0, cut);
    const future = features.slice(cut);
    // Always seed the roadmap with common post-MVP investments.
    const seeds = [
      'Analytics & reporting dashboards',
      'Notifications (email / in-app)',
      'Third-party integrations & public API',
      'Role-based admin & audit logs',
    ];
    for (const s of seeds) {
      if (future.length >= 6) break;
      if (!future.some((f) => f.toLowerCase().includes(s.split(' ')[0].toLowerCase()))) {
        future.push(s);
      }
    }
    return { mvp, futureFeatures: future };
  }

  /**
   * The offline metric set.
   *
   * Adoption metrics (activation, retention, engagement) are this stage's own to
   * choose — no other artifact states them, so there is nothing to contradict.
   * The performance and scale metrics are **not**: they restate a figure the
   * requirement document and the architecture also quote, so they are rendered
   * from the resolved targets rather than written here. A hardcoded "≤1.5s" in
   * this method is precisely how the two pages came to disagree.
   */
  private successMetrics(
    ctx: ProductVisionContext,
    targets: ServiceTargets,
    language: ArtifactLanguage,
  ): SuccessMetric[] {
    const noun = ctx.intent?.domain
      ? `${ctx.intent.domain} teams`
      : 'active users';
    const metrics: SuccessMetric[] = [
      {
        name: 'Activation rate',
        target: '≥ 40% of signups complete the core workflow in week one',
        rationale:
          'Shows the product delivers its core value quickly — the strongest early signal of product-market fit.',
      },
      {
        name: 'Weekly active usage',
        target: `Steady week-over-week growth in active ${noun}`,
        rationale: 'Indicates the product is becoming part of the routine.',
      },
      {
        name: 'Retention',
        target: '≥ 60% of users return in month two',
        rationale: 'Retention is the clearest measure of durable value.',
      },
    ];

    if (targets.latency) {
      metrics.push({
        name: 'Responsiveness',
        target: serviceTargetSentence(targets.latency, language),
        rationale:
          'The same response-time target the requirement document and the architecture are built around — a slower product loses the routine use the metrics above measure.',
      });
    }
    if (targets.totalUsers) {
      metrics.push({
        name: 'Adoption against the stated scale',
        target: serviceTargetSentence(targets.totalUsers, language),
        rationale:
          'Measures adoption against the scale the client actually stated, in registered users — the figure the rest of the package is sized to.',
      });
    }

    metrics.push({
      name: 'Time saved',
      target: 'Measurable reduction in time spent on the manual process',
      rationale:
        'Ties the product back to the concrete pain it was built to remove.',
    });
    return metrics;
  }

  private personas(users: string[], goal: string): Persona[] {
    return users.slice(0, 4).map((name) => ({
      name: this.titleCase(name),
      description: `A ${this.lower(name)} who relies on the product to ${this.lower(
        goal,
      )}.`,
      goals: [
        `Accomplish their part of the workflow with minimal friction`,
        `Trust the data and see clear status at a glance`,
      ],
      painPoints: [
        'Today the process is manual, slow, or error-prone',
        'Information is scattered across tools and hard to track',
      ],
    }));
  }

  private lower(s: string): string {
    const t = s.trim();
    return t.charAt(0).toLowerCase() + t.slice(1);
  }


  private titleCase(s: string): string {
    return s
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

