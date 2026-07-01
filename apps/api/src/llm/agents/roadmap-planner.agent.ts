import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  type ApiDesign,
  type DatabaseDesign,
  type IntentAnalysis,
  type ProjectRoadmap,
  type RequirementDocument,
  type RoadmapMilestone,
  type RoadmapPhase,
  type SystemDesign,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Everything the Roadmap Planner sequences — the full generated pipeline. */
export interface RoadmapContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
}

/**
 * Owns the Roadmap Planner stage: turns the generated design into an ordered
 * implementation plan — phases → milestones → tasks with rough effort and
 * dependencies. LLM-driven with a deterministic fallback assembled from the
 * artifacts, so the stage always yields a coherent, buildable roadmap.
 */
@Injectable()
export class RoadmapPlannerAgent extends BaseAgent {
  readonly role = AgentRole.RoadmapPlanner;

  private readonly logger = new Logger(RoadmapPlannerAgent.name);

  protected readonly systemPrompt = [
    'You are a pragmatic Engineering Lead planning delivery.',
    'Sequence the design into ordered phases (Foundation → Core → Supporting →',
    'Hardening & Launch). Each phase has a goal, milestones, concrete tasks, a',
    'rough effort estimate, and dependencies on earlier phases. Be realistic and',
    'incremental — ship a thin end-to-end slice early, defer nice-to-haves.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: RoadmapContext,
  ): Promise<ProjectRoadmap> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<ProjectRoadmap>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return this.normalize({ ...raw, sessionId, generatedAt });
      }
      this.logger.debug('Roadmap malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Roadmap failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: RoadmapContext): string {
    return [
      `Idea: ${ctx.idea}`,
      `Architecture: ${ctx.systemDesign.architecture}`,
      `Services: ${ctx.systemDesign.services.map((s) => s.name).join(', ')}`,
      `Entities: ${ctx.databaseDesign.entities.map((e) => e.name).join(', ')}`,
      `API modules: ${ctx.apiDesign.modules.map((m) => m.name).join(', ')}`,
      `Roles: ${ctx.requirements.roles.map((r) => r.name).join(', ')}`,
      '',
      'Return JSON with keys: summary, totalEstimate (e.g. "~10 weeks"), ' +
        'phases[] { name, goal, effort, dependsOn[] (phase names), milestones[] ' +
        '{ title, effort, tasks[] { title, detail } } }.',
    ].join('\n');
  }

  private isValid(value: Partial<ProjectRoadmap> | null): boolean {
    return (
      !!value &&
      Array.isArray(value.phases) &&
      value.phases.length > 0 &&
      value.phases.every(
        (p) => typeof p?.name === 'string' && Array.isArray(p?.milestones),
      )
    );
  }

  /** Backfill optional fields the model may omit so the shape is always complete. */
  private normalize(raw: Partial<ProjectRoadmap>): ProjectRoadmap {
    const phases: RoadmapPhase[] = (raw.phases ?? []).map((p) => ({
      name: p.name,
      goal: p.goal ?? '',
      effort: p.effort ?? '',
      dependsOn: p.dependsOn ?? [],
      milestones: (p.milestones ?? []).map((m) => ({
        title: m.title,
        effort: m.effort ?? '',
        tasks: (m.tasks ?? []).map((t) => ({ title: t.title, detail: t.detail })),
      })),
    }));
    return {
      sessionId: raw.sessionId!,
      generatedAt: raw.generatedAt!,
      summary: raw.summary ?? 'Phased implementation plan for the generated design.',
      totalEstimate: raw.totalEstimate ?? this.weeks(this.totalWeeks(phases)),
      phases,
    };
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: RoadmapContext,
  ): ProjectRoadmap {
    const phases: RoadmapPhase[] = [
      this.foundationPhase(ctx),
      this.corePhase(ctx),
      this.supportingPhase(ctx),
      this.hardeningPhase(ctx),
    ].filter((p) => p.milestones.length > 0);

    // Re-chain dependencies to the previous surviving phase so a dropped phase
    // (e.g. no services → no Core phase) never leaves a dangling dependsOn.
    phases.forEach((p, i) => {
      p.dependsOn = i === 0 ? [] : [phases[i - 1].name];
    });

    return {
      sessionId,
      generatedAt,
      summary: this.summary(ctx, phases),
      totalEstimate: this.weeks(this.totalWeeks(phases)),
      phases,
    };
  }

  private foundationPhase(ctx: RoadmapContext): RoadmapPhase {
    const roles = ctx.requirements.roles.map((r) => r.name);
    const entities = ctx.databaseDesign.entities.map((e) => e.name);
    const hasAuth = ctx.apiDesign.modules.some((m) => m.name === 'Auth');

    const milestones: RoadmapMilestone[] = [
      this.milestone('Project setup & CI', 3, [
        this.task(`Scaffold the ${ctx.systemDesign.architecture.replace(/_/g, ' ')} project and app structure`),
        this.task('Wire configuration & secrets via environment variables'),
        this.task('Set up CI (lint, test, build) and containerization'),
      ]),
    ];

    if (hasAuth || roles.length > 0) {
      milestones.push(
        this.milestone('Authentication & access control', 5, [
          this.task('Implement sign-up / sign-in and session handling'),
          roles.length
            ? this.task(`Define RBAC for roles: ${roles.join(', ')}`)
            : this.task('Define role-based access control'),
        ]),
      );
    }

    milestones.push(
      this.milestone('Data model & migrations', this.sizeWeeks(entities.length, 2), [
        this.task(
          entities.length
            ? `Create tables & migrations for: ${entities.slice(0, 6).join(', ')}${
                entities.length > 6 ? ', …' : ''
              }`
            : 'Create the initial schema & migrations',
        ),
        this.task('Add seed data and a migration/runbook'),
      ]),
    );

    return this.phase(
      'Foundation',
      'Project skeleton, authentication, and the data model.',
      [],
      milestones,
    );
  }

  private corePhase(ctx: RoadmapContext): RoadmapPhase {
    // A milestone per core service, wiring its matching API module endpoints.
    const milestones: RoadmapMilestone[] = ctx.systemDesign.services
      .slice(0, 6)
      .map((s) => {
        const mod = ctx.apiDesign.modules.find((m) => m.name === s.name);
        const endpoints = mod?.endpoints.length ?? 0;
        const tasks = [
          this.task(`Implement the ${s.name} service and business rules`),
          endpoints
            ? this.task(`Build ${endpoints} ${s.name} endpoint(s) with validation`)
            : this.task(`Build the ${s.name} API endpoints with validation`),
          this.task(`Cover ${s.name} with unit tests`),
        ];
        return this.milestone(`${s.name} module`, this.sizeWeeks(endpoints, 1), tasks);
      });

    return this.phase(
      'Core workflow',
      'The primary services and their APIs — a working end-to-end slice.',
      ['Foundation'],
      milestones,
    );
  }

  private supportingPhase(ctx: RoadmapContext): RoadmapPhase {
    const haystack = [
      ctx.idea,
      ...ctx.requirements.functional?.map((f) => f.description ?? '') ?? [],
      ...ctx.systemDesign.services.map((s) => s.name),
    ]
      .join(' ')
      .toLowerCase();

    const milestones: RoadmapMilestone[] = [];
    if (/notif|email|sms|alert/.test(haystack)) {
      milestones.push(
        this.milestone('Notifications', 1, [
          this.task('Email / in-app notifications for key events'),
        ]),
      );
    }
    if (/report|dashboard|analytic|statistic/.test(haystack)) {
      milestones.push(
        this.milestone('Reporting & dashboards', 2, [
          this.task('Aggregate metrics and expose reporting endpoints'),
          this.task('Build dashboard views'),
        ]),
      );
    }
    milestones.push(
      this.milestone('Search & filtering', 1, [
        this.task('Add search/filter across core entities with pagination'),
      ]),
    );

    return this.phase(
      'Supporting features',
      'Notifications, reporting, and cross-cutting features beyond the core.',
      ['Core workflow'],
      milestones,
    );
  }

  private hardeningPhase(ctx: RoadmapContext): RoadmapPhase {
    return this.phase(
      'Hardening & launch',
      'Security, performance, observability, and production readiness.',
      ['Supporting features'],
      [
        this.milestone('Security hardening', 1, [
          this.task('Enforce authz on every endpoint; add rate limiting'),
          this.task('Encrypt sensitive data in transit and at rest'),
          this.task('Add audit logging of sensitive actions'),
        ]),
        this.milestone('Performance & scale', 1, [
          this.task('Add caching for read-heavy endpoints'),
          this.task('Add DB indexes and pagination on list endpoints'),
        ]),
        this.milestone('Observability & QA', 1, [
          this.task('Structured logging, metrics, and tracing'),
          this.task('Integration/E2E tests and a CI gate'),
        ]),
        this.milestone('Deploy & launch', 1, [
          this.task('Provision production infra and backups'),
          this.task('Write a deploy + restore runbook and go live'),
        ]),
      ],
    );
  }

  // ── builders / estimates ────────────────────────────────────────────────

  private phase(
    name: string,
    goal: string,
    dependsOn: string[],
    milestones: RoadmapMilestone[],
  ): RoadmapPhase {
    const weeks = milestones.reduce((w, m) => w + this.milestoneWeeks(m), 0);
    return { name, goal, effort: this.weeks(weeks), dependsOn, milestones };
  }

  private milestone(
    title: string,
    days: number,
    tasks: { title: string; detail?: string }[],
  ): RoadmapMilestone {
    return { title, effort: this.days(days), tasks };
  }

  private task(title: string, detail?: string): { title: string; detail?: string } {
    return detail ? { title, detail } : { title };
  }

  /** Scale an effort by a count (endpoints/entities), clamped to a sane range. */
  private sizeWeeks(count: number, minWeeks: number): number {
    const days = Math.max(minWeeks * 5, Math.min(count, 12) * 1.5 + 2);
    return days;
  }

  private milestoneWeeks(m: RoadmapMilestone): number {
    const match = /([\d.]+)\s*(wk|week|day)/i.exec(m.effort);
    if (!match) return 1;
    const n = parseFloat(match[1]);
    return /day/i.test(match[2]) ? n / 5 : n;
  }

  private totalWeeks(phases: RoadmapPhase[]): number {
    return phases.reduce(
      (w, p) => w + p.milestones.reduce((mw, m) => mw + this.milestoneWeeks(m), 0),
      0,
    );
  }

  /** Format a day count as a human effort string ("3 days" / "1 wk"). */
  private days(days: number): string {
    if (days < 5) return `${Math.round(days)} days`;
    return this.weeks(days / 5);
  }

  private weeks(weeks: number): string {
    const w = Math.max(1, Math.round(weeks));
    return `~${w} wk${w === 1 ? '' : 's'}`;
  }

  private summary(ctx: RoadmapContext, phases: RoadmapPhase[]): string {
    return `A ${phases.length}-phase plan to build a ${ctx.systemDesign.architecture.replace(
      /_/g,
      ' ',
    )} system with ${ctx.systemDesign.services.length} services and ${
      ctx.databaseDesign.entities.length
    } entities: start with a thin end-to-end slice, then layer on supporting features, and finish with hardening and launch.`;
  }
}
