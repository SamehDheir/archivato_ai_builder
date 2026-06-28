import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  type ApiDesign,
  type DatabaseDesign,
  type IntentAnalysis,
  type RequirementDocument,
  type ReviewFinding,
  type ReviewReport,
  type SystemDesign,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Everything the Reviewer inspects — the full generated pipeline. */
export interface ReviewContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
}

/**
 * Owns the Review stage: critiques the generated system for scalability,
 * security, performance, gaps, and improvements. LLM-driven with a deterministic
 * heuristic fallback that inspects the artifacts, so the stage always yields a
 * useful report.
 */
@Injectable()
export class ReviewerAgent extends BaseAgent {
  readonly role = AgentRole.Reviewer;

  private readonly logger = new Logger(ReviewerAgent.name);

  protected readonly systemPrompt = [
    'You are a rigorous Principal Engineer performing an architecture review.',
    'Assess scalability (score 0-100), security issues, performance risks,',
    'missing features, and concrete recommendations. Be specific and honest;',
    'cite the design artifacts. Prefer high-signal findings over generic advice.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: ReviewContext,
  ): Promise<ReviewReport> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<ReviewReport>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return { ...(raw as ReviewReport), sessionId, generatedAt };
      }
      this.logger.debug('Review malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Review failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: ReviewContext): string {
    return [
      `Idea: ${ctx.idea}`,
      `Architecture: ${ctx.systemDesign.architecture}`,
      `Services: ${ctx.systemDesign.services.map((s) => s.name).join(', ')}`,
      `Entities: ${ctx.databaseDesign.entities.map((e) => e.name).join(', ')}`,
      `API modules: ${ctx.apiDesign.modules.map((m) => m.name).join(', ')}`,
      `Non-functional reqs: ${ctx.requirements.nonFunctional
        .map((n) => n.category)
        .join(', ')}`,
      '',
      'Return JSON with keys: scalabilityScore (0-100), summary, ' +
        'securityIssues[] {title,detail,severity}, performanceRisks[] ' +
        '{title,detail,severity}, missingFeatures[] (strings), ' +
        'recommendations[] (strings). severity ∈ low|medium|high|critical.',
    ].join('\n');
  }

  private isValid(value: Partial<ReviewReport> | null): boolean {
    return (
      !!value &&
      typeof value.scalabilityScore === 'number' &&
      Array.isArray(value.securityIssues) &&
      Array.isArray(value.performanceRisks) &&
      Array.isArray(value.recommendations)
    );
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: ReviewContext,
  ): ReviewReport {
    const haystack = this.haystack(ctx);
    const hasQueue = /bullmq|redis|queue|kafka|rabbit/.test(haystack);
    const hasCache = /redis|cache|cdn/.test(haystack);
    const securityIssues = this.securityIssues(ctx, haystack);
    const performanceRisks = this.performanceRisks(ctx, hasCache);

    return {
      sessionId,
      generatedAt,
      scalabilityScore: this.scalabilityScore(ctx, hasQueue, hasCache),
      summary: this.summary(ctx),
      securityIssues,
      performanceRisks,
      missingFeatures: this.missingFeatures(ctx, haystack),
      recommendations: this.recommendations(ctx, hasCache),
    };
  }

  private haystack(ctx: ReviewContext): string {
    return [
      ctx.idea,
      ctx.systemDesign.architecture,
      ...ctx.systemDesign.techStack.map((t) => `${t.layer} ${t.technology}`),
      ...ctx.requirements.nonFunctional.map((n) => `${n.category} ${n.description}`),
    ]
      .join(' ')
      .toLowerCase();
  }

  private scalabilityScore(
    ctx: ReviewContext,
    hasQueue: boolean,
    hasCache: boolean,
  ): number {
    let score = 60;
    if (ctx.systemDesign.architecture === 'microservices') score += 15;
    else if (ctx.systemDesign.architecture === 'modular_monolith') score += 8;
    if (hasQueue) score += 10;
    if (hasCache) score += 8;
    if (ctx.systemDesign.services.length >= 4) score += 5;
    // Pagination present on list endpoints is a good sign.
    if (this.hasPagination(ctx)) score += 6;
    return Math.max(0, Math.min(100, score));
  }

  private hasPagination(ctx: ReviewContext): boolean {
    return ctx.apiDesign.modules.some((m) =>
      m.endpoints.some(
        (e) =>
          e.method === 'GET' &&
          e.requestSchema.some((f) => f.name === 'page' || f.name === 'limit'),
      ),
    );
  }

  private securityIssues(
    ctx: ReviewContext,
    haystack: string,
  ): ReviewFinding[] {
    const issues: ReviewFinding[] = [];

    if (!/encrypt|tls|https|at rest/.test(haystack)) {
      issues.push({
        title: 'Encryption not explicitly specified',
        detail:
          'No non-functional requirement mandates encryption in transit/at rest. Specify TLS and at-rest encryption for sensitive data.',
        severity: 'high',
      });
    }

    const rolesWithoutPerms = ctx.requirements.roles.filter(
      (r) => r.permissions.length === 0,
    );
    if (rolesWithoutPerms.length > 0) {
      issues.push({
        title: 'Authorization rules under-specified',
        detail: `Roles ${rolesWithoutPerms
          .map((r) => r.name)
          .join(', ')} have no explicit permissions. Define per-role access control for each endpoint.`,
        severity: 'medium',
      });
    }

    const hasAuth = ctx.apiDesign.modules.some((m) => m.name === 'Auth');
    if (hasAuth && !/rate.?limit|throttl/.test(haystack)) {
      issues.push({
        title: 'No rate limiting on auth endpoints',
        detail:
          'Login/register endpoints are exposed without a documented rate-limit/lockout policy, enabling credential-stuffing and brute force.',
        severity: 'medium',
      });
    }

    return issues;
  }

  private performanceRisks(
    ctx: ReviewContext,
    hasCache: boolean,
  ): ReviewFinding[] {
    const risks: ReviewFinding[] = [];

    if (!this.hasPagination(ctx)) {
      risks.push({
        title: 'Unbounded list endpoints',
        detail:
          'List endpoints do not declare pagination parameters; large tables will produce slow, memory-heavy responses.',
        severity: 'high',
      });
    }

    if (!hasCache) {
      risks.push({
        title: 'No caching layer',
        detail:
          'The stack has no cache (e.g. Redis/CDN); read-heavy endpoints will hit the database directly under load.',
        severity: 'medium',
      });
    }

    if (ctx.databaseDesign.relations.length >= 3) {
      risks.push({
        title: 'Potential N+1 query patterns',
        detail:
          'Several relations exist; ensure list/detail queries eager-load related rows to avoid N+1 round-trips.',
        severity: 'low',
      });
    }

    return risks;
  }

  private missingFeatures(ctx: ReviewContext, haystack: string): string[] {
    const missing: string[] = [];
    const services = ctx.systemDesign.services.map((s) => s.name);
    const entities = ctx.databaseDesign.entities.map((e) => e.name);

    if (!/audit|activity log/.test(haystack) && !entities.includes('audit_logs')) {
      missing.push('Audit logging of sensitive actions');
    }
    if (!services.includes('Reporting')) {
      missing.push('Analytics / reporting dashboards');
    }
    if (!/search/.test(haystack)) {
      missing.push('Search / filtering across core entities');
    }
    if (!/backup|disaster recovery/.test(haystack)) {
      missing.push('Backup and disaster-recovery strategy');
    }
    return missing;
  }

  private recommendations(ctx: ReviewContext, hasCache: boolean): string[] {
    const recs: string[] = [
      'Add automated tests (unit + integration) and a CI pipeline before launch.',
      'Add structured logging, metrics, and tracing for observability.',
    ];
    if (!hasCache) {
      recs.push('Introduce a caching layer for read-heavy endpoints.');
    }
    if (ctx.systemDesign.architecture === 'microservices') {
      recs.push(
        'Define service boundaries and contracts carefully; add an API gateway and centralized auth.',
      );
    } else {
      recs.push(
        'Keep modules cleanly separated so the monolith can be split into services later.',
      );
    }
    recs.push('Document a database migration and backup/restore runbook.');
    return recs;
  }

  private summary(ctx: ReviewContext): string {
    return `Reviewed a ${ctx.systemDesign.architecture.replace(
      /_/g,
      ' ',
    )} design with ${ctx.systemDesign.services.length} services, ${
      ctx.databaseDesign.entities.length
    } entities, and ${ctx.apiDesign.modules.length} API modules. The foundation is sound; address the highlighted security and performance items before scaling.`;
  }
}
