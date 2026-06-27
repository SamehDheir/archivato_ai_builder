import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  type BusinessRule,
  type FunctionalRequirement,
  type IntentAnalysis,
  type InterviewExchange,
  type NonFunctionalRequirement,
  type RequirementDocument,
  type RequirementsSummary,
  type UserRole,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Everything the Requirement Engineer needs from a confirmed interview. */
export interface RequirementContext {
  idea: string;
  intent: IntentAnalysis | null;
  history: InterviewExchange[];
  summary: RequirementsSummary;
}

/**
 * Owns the Requirements stage: turns a confirmed interview into a formal,
 * structured Requirement Document. Tries the LLM, validates the shape, and
 * falls back to a deterministic build from the interview data so the stage
 * always yields a usable document (and demos cleanly in mock mode).
 */
@Injectable()
export class RequirementEngineerAgent extends BaseAgent {
  readonly role = AgentRole.RequirementEngineer;

  private readonly logger = new Logger(RequirementEngineerAgent.name);

  protected readonly systemPrompt = [
    'You are a meticulous Requirement Engineer.',
    'From an interview, produce a complete, non-redundant requirement document.',
    'Functional requirements get ids FR-1.., non-functional NFR-1.., rules BR-1..',
    'Prefer "must" priority for core features; never invent unstated scope.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: RequirementContext,
  ): Promise<RequirementDocument> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<RequirementDocument>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return { ...(raw as RequirementDocument), sessionId, generatedAt };
      }
      this.logger.debug('Requirement doc malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Requirement generation failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: RequirementContext): string {
    const qa = ctx.history
      .map((h) => `Q: ${h.question.prompt}\nA: ${h.answer}`)
      .join('\n');
    return [
      `Idea: ${ctx.idea}`,
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      '',
      'Interview transcript:',
      qa,
      '',
      'Return JSON with keys: functional[] {id,title,description,priority}, ' +
        'nonFunctional[] {id,category,description}, roles[] ' +
        '{name,description,permissions[]}, businessRules[] {id,description}, ' +
        'constraints[], assumptions[].',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private isValid(value: Partial<RequirementDocument> | null): boolean {
    return (
      !!value &&
      Array.isArray(value.functional) &&
      value.functional.length > 0 &&
      Array.isArray(value.nonFunctional) &&
      Array.isArray(value.roles)
    );
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: RequirementContext,
  ): RequirementDocument {
    const { summary } = ctx;

    const featureSources =
      summary.features.length > 0 ? summary.features : [summary.goal];
    const functional: FunctionalRequirement[] = featureSources.map(
      (feature, i) => ({
        id: `FR-${i + 1}`,
        title: truncateTitle(feature),
        description: feature,
        priority: 'must',
      }),
    );

    const nonFunctional: NonFunctionalRequirement[] = [
      ...summary.constraints.map((c, i) => ({
        id: `NFR-${i + 1}`,
        category: inferCategory(c),
        description: c,
      })),
      {
        id: `NFR-${summary.constraints.length + 1}`,
        category: 'security',
        description:
          'Sensitive data must be encrypted in transit and at rest; access is role-based.',
      },
    ];

    const roles: UserRole[] = summary.users.map((name) => ({
      name,
      description: `${name} role identified during the requirements interview.`,
      permissions: [],
    }));

    const businessRules: BusinessRule[] = summary.businessRules.map(
      (description, i) => ({ id: `BR-${i + 1}`, description }),
    );

    return {
      sessionId,
      generatedAt,
      functional,
      nonFunctional,
      roles,
      businessRules,
      constraints: summary.constraints,
      assumptions: summary.assumptions,
    };
  }
}

function truncateTitle(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}…`;
}

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/(user|scale|enterprise|mvp|traffic|load)/.test(t)) return 'scalability';
  if (/(sql|nosql|database|data)/.test(t)) return 'data';
  if (/(monolith|microservice|architecture)/.test(t)) return 'architecture';
  return 'general';
}
