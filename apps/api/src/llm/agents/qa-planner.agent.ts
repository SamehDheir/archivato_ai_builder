import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  TEST_TYPES,
  type ApiDesign,
  type DatabaseDesign,
  type IntentAnalysis,
  type QaPlan,
  type RequirementDocument,
  type TestCase,
  type TestPriority,
  type TestSuite,
  type TestType,
  type SystemDesign,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Everything the QA Planner tests — the full generated pipeline. */
export interface QaPlanContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
}

const VALID_TYPES = new Set<string>(TEST_TYPES.map((t) => t.type));
const VALID_PRIORITIES = new Set<TestPriority>(['high', 'medium', 'low']);

/**
 * Owns the Test/QA Plan stage: turns the generated design into a structured
 * testing plan (strategy + suites of concrete cases by type + coverage/tooling).
 * LLM-driven with a deterministic fallback assembled from the artifacts
 * (services → unit, API modules → integration, flows → e2e, roles/authz →
 * security, list endpoints → performance, functional reqs → acceptance), so the
 * stage always yields a complete plan offline and in tests.
 */
@Injectable()
export class QaPlannerAgent extends BaseAgent {
  readonly role = AgentRole.QaPlanner;

  private readonly logger = new Logger(QaPlannerAgent.name);

  protected readonly systemPrompt = [
    'You are a pragmatic QA lead writing a test plan for a specific system.',
    'Follow the testing pyramid: many unit tests, fewer integration, a few',
    'end-to-end, plus targeted security, performance, and acceptance tests.',
    'Produce concrete, verifiable test cases tied to THIS design’s services,',
    'endpoints, roles, and rules — not generic advice. Each case states an',
    'expected result. Include coverage goals, recommended tooling, and scope.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(sessionId: string, ctx: QaPlanContext): Promise<QaPlan> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<QaPlan>>(this.buildPrompt(ctx));
      if (this.isValid(raw)) {
        return this.normalize({ ...raw, sessionId, generatedAt }, ctx);
      }
      this.logger.debug('QA plan malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`QA plan failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  private buildPrompt(ctx: QaPlanContext): string {
    return [
      `Idea: ${ctx.idea}`,
      `Architecture: ${ctx.systemDesign.architecture}`,
      `Services: ${ctx.systemDesign.services.map((s) => s.name).join(', ')}`,
      `Entities: ${ctx.databaseDesign.entities.map((e) => e.name).join(', ')}`,
      `API modules: ${ctx.apiDesign.modules
        .map((m) => `${m.name}(${m.endpoints.length})`)
        .join(', ')}`,
      `Roles: ${ctx.requirements.roles.map((r) => r.name).join(', ')}`,
      `Functional reqs: ${ctx.requirements.functional
        .slice(0, 8)
        .map((f) => f.description)
        .join(' | ')}`,
      '',
      'Return JSON: { summary, strategy[] (strings), suites[] { name, type, ' +
        'objective, cases[] { id, title, expected, priority } }, coverageGoals[] ' +
        '(strings), tooling[] (strings), outOfScope[] (strings) }. type ∈ unit|' +
        'integration|e2e|security|performance|acceptance. priority ∈ ' +
        'high|medium|low. Give every suite type at least one case.',
    ].join('\n');
  }

  private isValid(value: Partial<QaPlan> | null): boolean {
    return (
      !!value &&
      Array.isArray(value.suites) &&
      value.suites.length > 0 &&
      value.suites.every(
        (s) =>
          !!s &&
          typeof s.name === 'string' &&
          VALID_TYPES.has(s.type as string) &&
          Array.isArray(s.cases),
      )
    );
  }

  /** Trust the model but sanitize + backfill so the plan shape is always complete. */
  private normalize(raw: Partial<QaPlan>, ctx: QaPlanContext): QaPlan {
    let n = 0;
    const suites: TestSuite[] = (raw.suites ?? [])
      .filter((s) => s && VALID_TYPES.has(s.type as string))
      .map((s) => ({
        name: (s.name ?? 'Suite').toString(),
        type: s.type as TestType,
        objective: (s.objective ?? '').toString(),
        cases: (s.cases ?? [])
          .filter((c) => c && typeof c.title === 'string')
          .map((c) => ({
            id: c.id?.toString() || `TC-${++n}`,
            title: c.title!.toString(),
            expected: (c.expected ?? 'Behaves as specified.').toString(),
            priority: VALID_PRIORITIES.has(c.priority as TestPriority)
              ? (c.priority as TestPriority)
              : 'medium',
          })),
      }))
      .filter((s) => s.cases.length > 0);

    return {
      sessionId: raw.sessionId!,
      generatedAt: raw.generatedAt!,
      summary: raw.summary?.trim() || this.summary(ctx, suites),
      strategy: this.strings(raw.strategy) ?? this.strategy(ctx),
      suites: suites.length ? suites : this.buildSuites(ctx),
      coverageGoals: this.strings(raw.coverageGoals) ?? this.coverageGoals(),
      tooling: this.strings(raw.tooling) ?? this.tooling(ctx),
      outOfScope: this.strings(raw.outOfScope) ?? this.outOfScope(),
    };
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: QaPlanContext,
  ): QaPlan {
    const suites = this.buildSuites(ctx);
    return {
      sessionId,
      generatedAt,
      summary: this.summary(ctx, suites),
      strategy: this.strategy(ctx),
      suites,
      coverageGoals: this.coverageGoals(),
      tooling: this.tooling(ctx),
      outOfScope: this.outOfScope(),
    };
  }

  private buildSuites(ctx: QaPlanContext): TestSuite[] {
    const counter = { n: 0 };
    const suites: TestSuite[] = [
      this.unitSuite(ctx, counter),
      this.integrationSuite(ctx, counter),
      this.e2eSuite(ctx, counter),
      this.securitySuite(ctx, counter),
      this.performanceSuite(ctx, counter),
      this.acceptanceSuite(ctx, counter),
    ];
    return suites.filter((s) => s.cases.length > 0);
  }

  private unitSuite(ctx: QaPlanContext, c: { n: number }): TestSuite {
    const cases: TestCase[] = [];
    for (const svc of ctx.systemDesign.services.slice(0, 6)) {
      cases.push(
        this.tc(c, `${svc.name} service: core logic returns expected results for valid input`, 'Business rules produce correct output.', 'high'),
      );
      cases.push(
        this.tc(c, `${svc.name} service: invalid input is rejected`, 'Throws / returns a validation error, no partial writes.', 'medium'),
      );
    }
    for (const rule of ctx.requirements.businessRules.slice(0, 4)) {
      cases.push(
        this.tc(c, `Business rule: ${this.trim(rule.description)}`, 'The rule is enforced in the domain layer.', 'medium'),
      );
    }
    if (!cases.length) {
      cases.push(this.tc(c, 'Domain logic handles valid and invalid input', 'Correct output for valid input; errors for invalid.', 'high'));
    }
    return {
      name: 'Domain & services',
      type: 'unit',
      objective: 'Verify business logic in isolation with mocked dependencies.',
      cases,
    };
  }

  private integrationSuite(ctx: QaPlanContext, c: { n: number }): TestSuite {
    const cases: TestCase[] = [];
    for (const mod of ctx.apiDesign.modules.slice(0, 8)) {
      const write = mod.endpoints.find((e) => e.method !== 'GET');
      const read = mod.endpoints.find((e) => e.method === 'GET');
      if (write) {
        cases.push(
          this.tc(c, `${mod.name}: ${write.method} ${write.path} persists and returns the expected status`, `Returns ${write.statusCodes?.[0] ?? 201} and the row is stored.`, 'high'),
        );
        cases.push(
          this.tc(c, `${mod.name}: ${write.method} ${write.path} rejects an invalid body`, 'Returns 400 with validation errors; nothing persisted.', 'medium'),
        );
      }
      if (read) {
        cases.push(
          this.tc(c, `${mod.name}: ${read.method} ${read.path} returns the expected shape`, 'Returns 200 with the documented response schema.', 'medium'),
        );
      }
    }
    if (!cases.length) {
      cases.push(this.tc(c, 'API endpoints return documented status codes and schemas', 'Each endpoint matches its contract.', 'high'));
    }
    return {
      name: 'API endpoints',
      type: 'integration',
      objective: 'Exercise controllers against a real DB (test container) via HTTP.',
      cases,
    };
  }

  private e2eSuite(ctx: QaPlanContext, c: { n: number }): TestSuite {
    const cases: TestCase[] = [];
    const hasAuth = ctx.apiDesign.modules.some((m) => m.name === 'Auth');
    if (hasAuth) {
      cases.push(this.tc(c, 'A new user can register, verify, and sign in', 'The full auth flow completes and a session is established.', 'high'));
    }
    // Primary CRUD journeys from the first couple of non-auth entities.
    const entities = ctx.databaseDesign.entities
      .filter((e) => !/user|token|session|auth/i.test(e.name))
      .slice(0, 3);
    for (const e of entities) {
      cases.push(
        this.tc(c, `A user can create, view, update, and delete a ${this.singular(e.name)}`, 'Each step reflects in the UI and persists.', 'high'),
      );
    }
    if (!cases.length) {
      cases.push(this.tc(c, 'A user can complete the primary happy-path journey', 'The core workflow succeeds end to end.', 'high'));
    }
    return {
      name: 'Critical user journeys',
      type: 'e2e',
      objective: 'Drive the real UI + API for the highest-value flows.',
      cases,
    };
  }

  private securitySuite(ctx: QaPlanContext, c: { n: number }): TestSuite {
    const cases: TestCase[] = [
      this.tc(c, 'Unauthenticated requests to protected routes are rejected', 'Returns 401 without leaking data.', 'high'),
      this.tc(c, 'A non-owner cannot access another user’s resources', 'Returns 404/403; no cross-tenant leak (IDOR).', 'high'),
      this.tc(c, 'Input is validated and sanitized against injection', 'Malicious payloads (SQLi/XSS) are rejected or escaped.', 'high'),
    ];
    const hasAuth = ctx.apiDesign.modules.some((m) => m.name === 'Auth');
    if (hasAuth) {
      cases.push(this.tc(c, 'Auth endpoints are rate-limited / locked out under brute force', 'Repeated attempts are throttled.', 'medium'));
    }
    if (ctx.requirements.roles.length > 1) {
      cases.push(this.tc(c, 'A lower-privilege role cannot perform privileged actions', 'Authorization denies the action (no privilege escalation).', 'high'));
    }
    return {
      name: 'AuthZ & input safety',
      type: 'security',
      objective: 'Verify authentication, authorization, and input handling.',
      cases,
    };
  }

  private performanceSuite(ctx: QaPlanContext, c: { n: number }): TestSuite {
    const cases: TestCase[] = [
      this.tc(c, 'List endpoints paginate and stay within a latency budget', 'p95 latency under target with realistic data volume.', 'medium'),
      this.tc(c, 'The system sustains the target concurrent load', 'No errors / acceptable latency at expected peak RPS.', 'medium'),
    ];
    if (ctx.databaseDesign.relations.length >= 3) {
      cases.push(this.tc(c, 'List/detail queries avoid N+1 round-trips', 'Related rows are eager-loaded; query count is bounded.', 'medium'));
    }
    return {
      name: 'Load & latency',
      type: 'performance',
      objective: 'Validate throughput, latency, and query efficiency under load.',
      cases,
    };
  }

  private acceptanceSuite(ctx: QaPlanContext, c: { n: number }): TestSuite {
    const cases: TestCase[] = ctx.requirements.functional
      .slice(0, 8)
      .map((f) =>
        this.tc(
          c,
          `${f.id ? `${f.id}: ` : ''}${this.trim(f.description)}`,
          'The delivered behaviour satisfies the requirement.',
          this.acceptancePriority(f.priority),
        ),
      );
    if (!cases.length) {
      cases.push(this.tc(c, 'The product meets its stated functional requirements', 'Stakeholders accept the delivered behaviour.', 'high'));
    }
    return {
      name: 'Functional acceptance',
      type: 'acceptance',
      objective: 'Confirm each functional requirement is met (UAT).',
      cases,
    };
  }

  // ── strategy / meta ───────────────────────────────────────────────────────

  private strategy(ctx: QaPlanContext): string[] {
    return [
      'Follow the testing pyramid: a broad base of fast unit tests, fewer integration tests, and a small set of end-to-end tests for critical journeys.',
      `Run integration tests against a real ${ctx.databaseDesign.databaseType || 'database'} in an ephemeral test container, not mocks, so contracts are exercised for real.`,
      'Gate merges on lint + typecheck + the unit/integration suites in CI; run e2e and performance suites on a schedule or pre-release.',
      'Seed deterministic fixtures and reset state between tests so runs are isolated and repeatable.',
    ];
  }

  private coverageGoals(): string[] {
    return [
      '≥ 80% line/branch coverage on service (domain) code.',
      'Every API endpoint has at least one happy-path and one failure integration test.',
      'Every critical user journey has an end-to-end test.',
      'Every role/permission boundary has an authorization test.',
    ];
  }

  private tooling(ctx: QaPlanContext): string[] {
    const hay = [
      ctx.systemDesign.architecture,
      ...ctx.systemDesign.techStack.map((t) => `${t.layer} ${t.technology}`),
    ]
      .join(' ')
      .toLowerCase();
    const tools: string[] = [];
    const isNode = /nest|node|next|express|typescript|javascript/.test(hay);
    tools.push(
      isNode
        ? 'Unit/integration: Jest + Supertest'
        : 'Unit/integration: the stack’s standard test runner + an HTTP assertion library',
    );
    tools.push('End-to-end: Playwright (or Cypress) driving the real UI');
    tools.push('Performance: k6 or Artillery for load testing');
    tools.push('Security: OWASP ZAP baseline scan + dependency audit in CI');
    tools.push('Test data: containerized DB (Testcontainers) with seeded fixtures');
    return tools;
  }

  private outOfScope(): string[] {
    return [
      'Third-party providers’ own reliability (payment, email, OAuth) — mock at the boundary.',
      'Infrastructure/cloud-account and physical security (covered by the threat model / ops).',
      'Exhaustive manual exploratory testing (complements, but is not part of, this automated plan).',
    ];
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private tc(
    c: { n: number },
    title: string,
    expected: string,
    priority: TestPriority,
  ): TestCase {
    return { id: `TC-${++c.n}`, title, expected, priority };
  }

  private acceptancePriority(p: string | undefined): TestPriority {
    if (p === 'must') return 'high';
    if (p === 'could') return 'low';
    return 'medium';
  }

  private singular(name: string): string {
    const n = name.replace(/_/g, ' ');
    return n.endsWith('ies')
      ? `${n.slice(0, -3)}y`
      : n.endsWith('s')
        ? n.slice(0, -1)
        : n;
  }

  private trim(text: string): string {
    const t = (text ?? '').trim();
    return t.length > 100 ? `${t.slice(0, 97)}…` : t || 'requirement';
  }

  private summary(ctx: QaPlanContext, suites: TestSuite[]): string {
    const total = suites.reduce((n, s) => n + s.cases.length, 0);
    return `A test plan for a ${ctx.systemDesign.architecture.replace(
      /_/g,
      ' ',
    )} system: ${total} cases across ${suites.length} suites (unit → integration → e2e, plus security, performance, and acceptance), tied to the design’s services, endpoints, and requirements. Automate the unit/integration base in CI and layer e2e/performance for releases.`;
  }

  private strings(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out = v.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    return out.length ? out : undefined;
  }
}
