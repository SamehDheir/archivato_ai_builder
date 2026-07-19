import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  type IntentAnalysis,
  type Persona,
  type ProductVision,
  type ProjectScale,
  type RequirementsSummary,
  type SuccessMetric,
  untrustedField,
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
    const generated = await this.generateArtifact<ProductVision>({
      label: 'Product vision',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) => ({ ...(raw as ProductVision), sessionId, generatedAt }),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
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

  private buildPrompt(ctx: ProductVisionContext): string {
    return [
      untrustedField('Idea', ctx.idea),
      ctx.industry ? `Industry: ${ctx.industry}` : '',
      ctx.scale ? `Scale: ${ctx.scale}` : '',
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      ctx.intent ? `Primary users: ${ctx.intent.primaryUsers.join(', ')}` : '',
      ctx.summary ? `Goal: ${ctx.summary.goal}` : '',
      ctx.summary ? `Users: ${ctx.summary.users.join(', ')}` : '',
      ctx.summary ? `Features: ${ctx.summary.features.join(', ')}` : '',
      '',
      'Produce the product vision as JSON with these keys:',
      '- vision: one inspiring but concrete sentence — who it serves and the change it creates.',
      '- goals: 3-5 strategic outcomes (not features) the product must achieve.',
      '- mvp: the smallest end-to-end scope worth launching (list of capabilities).',
      '- futureFeatures: what is deliberately deferred to after the MVP.',
      '- successMetrics[]: {name, target (measurable), rationale (why it signals success)}.',
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
      successMetrics: this.successMetrics(ctx),
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

  private successMetrics(ctx: ProductVisionContext): SuccessMetric[] {
    const noun = ctx.intent?.domain
      ? `${ctx.intent.domain} teams`
      : 'active users';
    return [
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
      {
        name: 'Time saved',
        target: 'Measurable reduction in time spent on the manual process',
        rationale:
          'Ties the product back to the concrete pain it was built to remove.',
      },
    ];
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
