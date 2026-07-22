import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  buildPhaseEffort,
  formatWeekRange,
  type AlternativeRoadmaps,
  type ApiDesign,
  type DatabaseDesign,
  type EffortEstimate,
  type IntentAnalysis,
  type ProjectRoadmap,
  type RequirementDocument,
  type RoadmapMilestone,
  type RoadmapPhase,
  type SlotMap,
  type SystemDesign,
  untrustedField,
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
  /** Interview slots (timeline/core_workflows); absent in plan-mode runs. */
  slots?: SlotMap | null;
  /**
   * Deterministic effort estimate (R9). When present, the CODE computes each
   * phase's week range from it (`buildPhaseEffort`) — the LLM only groups modules.
   */
  effort?: EffortEstimate | null;
  /**
   * True when the stated timeline can't fit the full scope (B3): ask the LLM for a
   * dual roadmap (within-deadline / full-scope). The fallback ignores this and
   * produces a single roadmap (the conflict surfaces as an automated review finding).
   */
  requestDualRoadmap?: boolean;
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

  protected readonly systemPrompt = [
    'You are a pragmatic Engineering Lead turning a completed design into a',
    'realistic, buildable delivery plan a small team could execute.',
    'Method: sequence the work into ordered phases (Foundation → Core → Supporting',
    '→ Hardening & Launch). Front-load risk and dependencies: stand up the',
    'skeleton, auth, and data model first, then ship a thin end-to-end slice of the',
    'core workflow before breadth, and defer nice-to-haves to later phases. Each',
    'phase has a clear goal, milestones, concrete engineering tasks, and',
    'dependencies on earlier phases only (no forward or circular dependencies).',
    'For each phase also list moduleNames — which of the design’s services it',
    'builds — so effort can be attributed to it.',
    'Phase 1 is ALWAYS the MVP: the smallest coherent set of modules that delivers',
    'the core workflow end to end. Flag it isMvp:true and give it a one-sentence',
    'mvpStatement describing what is usable/launchable at the end of it.',
    'CRITICAL: do NOT output week numbers, durations, or effort figures anywhere —',
    'those are computed downstream from the effort estimate. Group modules; never',
    'estimate time.',
    'Output standard: tasks are specific to THIS design’s services, entities, and',
    'endpoints (not generic SDLC steps), and the ordering is genuinely executable —',
    'nothing depends on work scheduled after it. Return ONLY strict JSON matching',
    'the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: RoadmapContext,
  ): Promise<ProjectRoadmap> {
    const generatedAt = new Date().toISOString();
    return this.generateArtifact<ProjectRoadmap>({
      label: 'Roadmap',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) => this.normalize({ ...raw, sessionId, generatedAt }, ctx),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
    });
  }

  private buildPrompt(ctx: RoadmapContext): string {
    const workflow = this.slotText(ctx, 'core_workflows');
    const timeline = this.slotText(ctx, 'timeline');
    const lines = [
      untrustedField('Idea', ctx.idea),
      `Architecture: ${ctx.systemDesign.architecture}`,
      `Services (modules): ${ctx.systemDesign.services
        .map((s) => `${s.name}${s.complexity ? `[${s.complexity}]` : ''}`)
        .join(', ')}`,
      `Entities: ${ctx.databaseDesign.entities.map((e) => e.name).join(', ')}`,
      `API modules: ${ctx.apiDesign.modules
        .map((m) => `${m.name}(${m.endpoints.length})`)
        .join(', ')}`,
      `Roles: ${ctx.requirements.roles.map((r) => r.name).join(', ') || 'none'}`,
      `Core workflow (defines the MVP): ${workflow || 'the primary end-to-end flow'}`,
      `Stated timeline: ${timeline || 'not stated'}`,
      '',
      'Produce the implementation roadmap as JSON with these keys:',
      '- summary: 1-2 sentences on the delivery approach.',
      '- phases[]: {name, goal, dependsOn[] (names of earlier phases only), moduleNames[] (which Services this phase builds), milestones[], and for phase 1 only isMvp:true + mvpStatement}.',
      '  Each milestone: {title, tasks[] {title, detail?}} — tasks reference concrete services/entities/endpoints from this design.',
      '  Do NOT include any effort/week/day numbers on phases, milestones, or the roadmap — omit them entirely.',
    ];

    // B3 — a timeline conflict: ask for the dual roadmap. Only requested when the
    // deterministic pre-check found the stated deadline can't fit the full scope.
    if (ctx.requestDualRoadmap) {
      lines.push(
        '',
        `The stated timeline (${timeline}) cannot fit the full scope. ALSO return alternativeRoadmaps:`,
        '- alternativeRoadmaps: {',
        '    withinDeadline: phases[] — a REDUCED-scope plan that fits the deadline (fewer moduleNames per phase; defer non-core modules),',
        '    fullScope: phases[] — the realistic full-scope plan (same phases as above),',
        '    excludedFromDeadline: string[] — what the within-deadline plan drops, in plain client language.',
        '  }',
        '  Same rules: group moduleNames, phase 1 is the MVP, NO week/day numbers.',
      );
    }
    return lines.join('\n');
  }

  /** A slot's text value, or '' when absent / marked not-applicable. */
  private slotText(ctx: RoadmapContext, key: 'core_workflows' | 'timeline'): string {
    const slot = ctx.slots?.[key];
    return slot && !slot.na ? slot.value : '';
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
  private normalize(raw: Partial<ProjectRoadmap>, ctx: RoadmapContext): ProjectRoadmap {
    let phases = this.mapPhases(raw.phases, ctx);
    // The LLM never emits week numbers — compute them from the effort estimate.
    if (ctx.effort) phases = buildPhaseEffort(phases, ctx.effort);

    // B3 — keep the dual roadmap only when we actually asked for it and the model
    // returned both halves; otherwise it's a single roadmap.
    const alt = this.mapAlternatives(raw.alternativeRoadmaps, ctx);

    return {
      sessionId: raw.sessionId!,
      generatedAt: raw.generatedAt!,
      summary: raw.summary ?? 'Phased implementation plan for the generated design.',
      // Totals come from the effort estimate when present (never the LLM).
      totalEstimate: ctx.effort
        ? formatWeekRange(ctx.effort.weeksMin, ctx.effort.weeksMax)
        : raw.totalEstimate ?? this.weeks(this.totalWeeks(phases)),
      phases,
      ...(alt ? { alternativeRoadmaps: alt } : {}),
    };
  }

  /** Map raw LLM phases into complete phases; enforce the MVP flag on phase 1. */
  private mapPhases(
    raw: ProjectRoadmap['phases'] | undefined,
    ctx: RoadmapContext,
  ): RoadmapPhase[] {
    // `?? []` is NOT enough here, and this crashed in production:
    // `TypeError: (raw ?? []).map is not a function`. A model that answers with
    // an object where an array was asked for passes the nullish check and dies
    // on `.map` — the documented rule is that a required array must read as
    // empty whether it is MISSING or MISTYPED. `asArray` is that rule.
    const phases: RoadmapPhase[] = asArray(raw).map((p) => ({
      name: p.name,
      goal: p.goal ?? '',
      effort: '', // never trusted from the LLM; buildPhaseEffort fills the numbers
      dependsOn: asArray(p.dependsOn),
      moduleNames: Array.isArray(p.moduleNames) ? p.moduleNames : undefined,
      isMvp: !!p.isMvp,
      mvpStatement:
        typeof p.mvpStatement === 'string' ? p.mvpStatement : undefined,
      milestones: asArray(p.milestones).map((m) => ({
        title: m.title,
        effort: '',
        tasks: asArray(m.tasks).map(toTask),
      })),
    }));
    return this.ensureMvp(phases, ctx);
  }

  /** Phase 1 is always the MVP; backfill its statement if the model skipped it. */
  private ensureMvp(phases: RoadmapPhase[], ctx: RoadmapContext): RoadmapPhase[] {
    if (phases.length === 0) return phases;
    return phases.map((p, i) =>
      i === 0
        ? { ...p, isMvp: true, mvpStatement: p.mvpStatement || this.mvpStatement(ctx) }
        : { ...p, isMvp: false },
    );
  }

  /** Map + effort-fill the dual roadmap, or undefined when it wasn't produced. */
  private mapAlternatives(
    raw: AlternativeRoadmaps | undefined,
    ctx: RoadmapContext,
  ): AlternativeRoadmaps | undefined {
    if (!ctx.requestDualRoadmap || !raw) return undefined;
    // `isValid` gates on `phases` and never looks at this branch, so a malformed
    // alternative reaches here unchecked — which is how the production crash
    // happened: the prompt asks for `withinDeadline: phases[]` and the model
    // answered `withinDeadline: { phases: [...] }`, an object that sailed past
    // `?? []` and died on `.map`. `phasesOf` reads either shape, so the dual
    // roadmap survives instead of being silently dropped.
    const within = this.mapPhases(phasesOf(raw.withinDeadline), ctx);
    const full = this.mapPhases(phasesOf(raw.fullScope), ctx);
    if (within.length === 0 || full.length === 0) return undefined;
    return {
      withinDeadline: ctx.effort ? buildPhaseEffort(within, ctx.effort) : within,
      fullScope: ctx.effort ? buildPhaseEffort(full, ctx.effort) : full,
      excludedFromDeadline: Array.isArray(raw.excludedFromDeadline)
        ? raw.excludedFromDeadline.filter((s) => typeof s === 'string')
        : [],
    };
  }

  /** What Phase 1 delivers — aligned with the R8 phased MVP or the core workflow. */
  private mvpStatement(ctx: RoadmapContext): string {
    const phased = ctx.systemDesign.phasedArchitecture?.mvp;
    if (phased && phased.trim()) return phased.trim();
    const workflow = this.slotText(ctx, 'core_workflows');
    if (workflow) {
      return `At the end of Phase 1 the core workflow is usable end to end: ${workflow}`;
    }
    return 'At the end of Phase 1 a working end-to-end slice of the core workflow is usable.';
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: RoadmapContext,
  ): ProjectRoadmap {
    let phases: RoadmapPhase[] = [
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

    // Phase 1 is the MVP, and (when the effort estimate exists) each phase gets an
    // effort-grounded week range. No dual roadmap here — that needs LLM judgment;
    // the timeline conflict surfaces as an automated review finding instead.
    phases = this.ensureMvp(phases, ctx);
    if (ctx.effort) phases = buildPhaseEffort(phases, ctx.effort);

    return {
      sessionId,
      generatedAt,
      summary: this.summary(ctx, phases),
      totalEstimate: ctx.effort
        ? formatWeekRange(ctx.effort.weeksMin, ctx.effort.weeksMax)
        : this.weeks(this.totalWeeks(phases)),
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
    const services = ctx.systemDesign.services.slice(0, 6);
    const milestones: RoadmapMilestone[] = services.map((s) => {
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

    const phase = this.phase(
      'Core workflow',
      'The primary services and their APIs — a working end-to-end slice.',
      ['Foundation'],
      milestones,
    );
    // The design modules this phase builds — the anchor `buildPhaseEffort` uses to
    // attribute each service's effort line to this phase.
    phase.moduleNames = services.map((s) => s.name);
    return phase;
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

  private hardeningPhase(_ctx: RoadmapContext): RoadmapPhase {
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

/**
 * Read a value that must be an array, tolerating both absent and MISTYPED.
 *
 * `?? []` only covers the first case. A real run crashed with
 * `TypeError: (raw ?? []).map is not a function` because the model returned an
 * object where the schema asked for a list — truthy, so the nullish coalesce
 * passed it straight through to `.map`. Every array read on this untrusted
 * payload goes through here.
 */
function asArray<T>(value: readonly T[] | undefined | null): T[];
function asArray<T>(value: unknown): T[];
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * A phase list that may have arrived wrapped in an object.
 *
 * The schema asks for `withinDeadline: phases[]`, and a real completion returned
 * `withinDeadline: { phases: [...] }` — a fair reading of a field *named*
 * phases, and the content behind it was perfectly good. Unwrapping it recovers
 * a whole alternative roadmap that would otherwise be discarded; anything else
 * still reads as empty.
 */
function phasesOf(value: unknown): ProjectRoadmap['phases'] {
  if (Array.isArray(value)) return value as ProjectRoadmap['phases'];
  const wrapped = (value as { phases?: unknown } | null | undefined)?.phases;
  return asArray<ProjectRoadmap['phases'][number]>(wrapped);
}

/**
 * Coerce one task entry, which the model does not always shape consistently.
 *
 * Observed in a real (rejected) completion: a `tasks` array holding a mix of
 * `{title}` objects and bare strings — `[{"title":"Support tag filter"},"Add
 * pagination","Implement fuzzy matching"]`. Reading `.title` off a string
 * yields `undefined`, so those tasks rendered blank in the roadmap. A string IS
 * the title.
 */
function toTask(value: unknown): { title: string; detail?: string } {
  if (typeof value === 'string') return { title: value };
  const t = (value ?? {}) as { title?: unknown; detail?: unknown };
  return {
    title: typeof t.title === 'string' ? t.title : '',
    ...(typeof t.detail === 'string' ? { detail: t.detail } : {}),
  };
}
