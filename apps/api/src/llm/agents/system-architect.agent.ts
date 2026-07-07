import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  type ArchitectureType,
  type IntentAnalysis,
  type RequirementDocument,
  type ServiceModule,
  type SystemDesign,
  type TechChoice,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** What the System Architect needs from the upstream stages. */
export interface SystemDesignContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
}

/**
 * Owns the System Design stage: recommends an architecture type, a tech stack,
 * and a service breakdown. LLM-driven with a deterministic fallback derived
 * from the requirements so the stage always yields a valid design.
 */
@Injectable()
export class SystemArchitectAgent extends BaseAgent {
  readonly role = AgentRole.SystemArchitect;

  private readonly logger = new Logger(SystemArchitectAgent.name);

  protected readonly systemPrompt = [
    'You are a pragmatic Staff System Architect. From a requirement document you',
    'recommend the architecture style, a concrete technology stack, and a service',
    'breakdown that a team could start building immediately.',
    'Method: choose the SIMPLEST architecture that satisfies the functional and',
    'non-functional requirements — default to a modular monolith and only reach',
    'for microservices when real scale, team, or independent-deployment signals',
    'justify the operational cost. Decompose services by business capability with',
    'clear responsibilities and explicit dependencies (no cycles). Pick mainstream,',
    'production-proven technologies and justify each against a specific requirement,',
    'not fashion.',
    'Output standard: every rationale cites a concrete driver from the requirements',
    '(a load target, a data shape, a compliance need) — no generic "it is popular"',
    'reasoning. Names are precise, responsibilities are one sentence each, and the',
    'design is internally consistent (the stack supports the services, the services',
    'cover the requirements). Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: SystemDesignContext,
  ): Promise<SystemDesign> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<SystemDesign>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return { ...(raw as SystemDesign), sessionId, generatedAt };
      }
      this.logger.debug('System design malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`System design failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: SystemDesignContext): string {
    const fr = ctx.requirements.functional
      .map((f) => `- ${f.id} (${f.priority}): ${f.title}`)
      .join('\n');
    const nfr = ctx.requirements.nonFunctional
      .map((n) => `- ${n.category}: ${n.description}`)
      .join('\n');
    return [
      `Idea: ${ctx.idea}`,
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      'Functional requirements:',
      fr,
      'Non-functional requirements (these drive the architecture):',
      nfr || '- none stated',
      `Constraints: ${ctx.requirements.constraints.join('; ') || 'none'}`,
      '',
      'Design the system and return JSON with these keys:',
      '- architecture: one of monolith | modular_monolith | microservices.',
      '- architectureRationale: why this style fits THESE requirements (cite the load/team/deployment driver).',
      '- techStack[]: {layer (e.g. backend, frontend, database, cache, queue, auth), technology (a specific product/framework), rationale (tied to a requirement)}.',
      '- services[]: {name, responsibility (one sentence), dependencies[] (names of other services it calls)}.',
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

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: SystemDesignContext,
  ): SystemDesign {
    const haystack = this.haystack(ctx);
    const architecture = this.inferArchitecture(haystack);

    return {
      sessionId,
      generatedAt,
      architecture,
      architectureRationale: this.architectureRationale(architecture),
      techStack: this.inferTechStack(haystack),
      services: this.inferServices(haystack),
    };
  }

  /** Lowercased blob of all requirement text for keyword inference. */
  private haystack(ctx: SystemDesignContext): string {
    const r = ctx.requirements;
    return [
      ctx.idea,
      ...r.functional.map((f) => `${f.title} ${f.description}`),
      ...r.nonFunctional.map((n) => n.description),
      ...r.constraints,
    ]
      .join(' ')
      .toLowerCase();
  }

  private inferArchitecture(text: string): ArchitectureType {
    if (/micro-?service/.test(text)) return 'microservices';
    if (/(enterprise|millions of users|high scale|globally)/.test(text)) {
      return 'microservices';
    }
    return 'modular_monolith';
  }

  private architectureRationale(arch: ArchitectureType): string {
    switch (arch) {
      case 'microservices':
        return 'Scale and independent-deployment signals justify splitting into services.';
      case 'monolith':
        return 'Smallest possible footprint for an early MVP.';
      default:
        return 'A modular monolith keeps the MVP simple while allowing later extraction into services.';
    }
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

  private inferServices(text: string): ServiceModule[] {
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
}
