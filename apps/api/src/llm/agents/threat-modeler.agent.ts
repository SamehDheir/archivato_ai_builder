import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  scaleOperationsPromptBlock,
  STRIDE_CATEGORIES,
  type ApiDesign,
  type DatabaseDesign,
  type IntentAnalysis,
  type RequirementDocument,
  type ScaleTier,
  type Severity,
  type StrideCategory,
  type SystemDesign,
  type Threat,
  type ThreatModel,
  untrustedField,
  normalizeThreatModel,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Everything the Threat Modeler inspects — the full generated pipeline. */
export interface ThreatModelContext {
  idea: string;
  intent: IntentAnalysis | null;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
}

const VALID_CATEGORIES = new Set<string>(
  STRIDE_CATEGORIES.map((c) => c.category),
);
const VALID_SEVERITIES = new Set<Severity>(['low', 'medium', 'high', 'critical']);

/**
 * Owns the Threat Model stage: a STRIDE analysis of the generated design.
 * LLM-driven with a deterministic heuristic fallback that inspects the
 * artifacts (auth, roles/permissions, endpoints, sensitive entities, caches/
 * queues), so the stage always yields a complete model — one shape offline and
 * with a real provider.
 */
@Injectable()
export class ThreatModelerAgent extends BaseAgent {
  readonly role = AgentRole.ThreatModeler;

  protected readonly systemPrompt = [
    'You are an application security engineer performing a STRIDE threat model of a',
    'generated system design, before it is built.',
    'Method: reason from the system’s real attack surface — entry points, trust',
    'boundaries, data stores, roles, and third-party integrations. For every STRIDE',
    'category (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of',
    'Service, Elevation of Privilege) enumerate concrete threats against THIS',
    'system’s components, each with a severity (low|medium|high|critical) rated on',
    'likelihood × impact, and a specific, actionable mitigation (a control an',
    'engineer implements, not "add security"). Cover every category. Also list the',
    'trust boundaries and the assumptions the model rests on.',
    'Output standard: each threat names a real component/entry point from the',
    'design and describes an attack a competent tester could attempt — no generic',
    'OWASP recitation, no duplicate threats. Severities are honest and consistent.',
    'Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: ThreatModelContext,
  ): Promise<ThreatModel> {
    const generatedAt = new Date().toISOString();
    return this.generateArtifact<ThreatModel>({
      label: 'Threat model',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) =>
        normalizeThreatModel(this.normalize({ ...raw, sessionId, generatedAt }, ctx)),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
    });
  }

  private buildPrompt(ctx: ThreatModelContext): string {
    return [
      untrustedField('Idea', ctx.idea),
      `Architecture: ${ctx.systemDesign.architecture}`,
      `Services: ${ctx.systemDesign.services.map((s) => s.name).join(', ')}`,
      `Entities: ${ctx.databaseDesign.entities.map((e) => e.name).join(', ')}`,
      `API modules: ${ctx.apiDesign.modules
        .map((m) => `${m.name}(${m.endpoints.length})`)
        .join(', ')}`,
      `Roles: ${ctx.requirements.roles
        .map((r) => `${r.name}[${r.permissions.length} perms]`)
        .join(', ')}`,
      `Non-functional: ${ctx.requirements.nonFunctional
        .map((n) => n.category)
        .join(', ')}`,
      // Threats are found at any scale; what changes with scale is what the team
      // can realistically operate as a control. A mitigation naming a product
      // nobody will buy is not a mitigation — it reads as done and leaves the
      // threat open.
      ...(this.tier(ctx)
        ? ['', scaleOperationsPromptBlock(this.tier(ctx))]
        : []),
      '',
      'Produce the STRIDE threat model as JSON with these keys:',
      '- summary: 1-3 sentences on the overall posture and the top exposure.',
      '- trustBoundaries[]: the security boundaries data crosses (strings).',
      '- assumptions[]: what the model assumes is already handled (strings).',
      '- threats[]: {category, component (the real entry point/asset), threat (the concrete attack), severity, mitigation (a specific control)}.',
      'category ∈ spoofing | tampering | repudiation | information_disclosure | denial_of_service | elevation_of_privilege.',
      'severity ∈ low | medium | high | critical. Include at least one threat for every one of the six categories.',
      'Rate and mitigate honestly for the stated tier: name the threat whatever the scale, but every mitigation must be a control THIS team can actually operate.',
    ].join('\n');
  }

  /**
   * The tier the System Architect decided, read off the design.
   *
   * Severity is never scaled down by it — a small project's IDOR is still an
   * IDOR. Only the *mitigation* moves, because a control the team will not buy or
   * run is not a control; it is a threat marked closed.
   */
  private tier(ctx: ThreatModelContext): ScaleTier | undefined {
    return ctx.systemDesign.scaleTier;
  }

  private isValid(value: Partial<ThreatModel> | null): boolean {
    return (
      !!value &&
      Array.isArray(value.threats) &&
      value.threats.length > 0 &&
      value.threats.every(
        (t) =>
          !!t &&
          typeof t.threat === 'string' &&
          VALID_CATEGORIES.has(t.category as string),
      )
    );
  }

  /**
   * Trust the model's threats but sanitize each field and backfill the summary /
   * boundaries / assumptions, so the artifact shape is always complete. Any
   * STRIDE category the model skipped is filled from the deterministic build so
   * every category is represented.
   */
  private normalize(
    raw: Partial<ThreatModel>,
    ctx: ThreatModelContext,
  ): ThreatModel {
    const threats: Threat[] = (raw.threats ?? [])
      .filter((t) => t && VALID_CATEGORIES.has(t.category as string))
      .map((t) => ({
        category: t.category as StrideCategory,
        component: (t.component ?? 'System').toString(),
        threat: t.threat!.toString(),
        severity: VALID_SEVERITIES.has(t.severity as Severity)
          ? (t.severity as Severity)
          : 'medium',
        mitigation: (t.mitigation ?? 'Add an appropriate control.').toString(),
      }));

    // Ensure every STRIDE category has at least one threat.
    const present = new Set(threats.map((t) => t.category));
    const fallback = this.buildThreats(ctx);
    for (const cat of STRIDE_CATEGORIES.map((c) => c.category)) {
      if (!present.has(cat)) {
        threats.push(...fallback.filter((t) => t.category === cat).slice(0, 1));
      }
    }

    return {
      sessionId: raw.sessionId!,
      generatedAt: raw.generatedAt!,
      summary: raw.summary?.trim() || this.summary(ctx, threats),
      trustBoundaries:
        this.strings(raw.trustBoundaries) ?? this.trustBoundaries(ctx),
      assumptions: this.strings(raw.assumptions) ?? this.assumptions(),
      threats: this.sortThreats(threats),
    };
  }

  // ── deterministic fallback ──────────────────────────────────────────────

  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: ThreatModelContext,
  ): ThreatModel {
    const threats = this.sortThreats(this.buildThreats(ctx));
    return {
      sessionId,
      generatedAt,
      summary: this.summary(ctx, threats),
      trustBoundaries: this.trustBoundaries(ctx),
      assumptions: this.assumptions(),
      threats,
    };
  }

  private buildThreats(ctx: ThreatModelContext): Threat[] {
    const hay = this.haystack(ctx);
    const hasAuth = ctx.apiDesign.modules.some((m) => m.name === 'Auth');
    const hasRateLimit = /rate.?limit|throttl/.test(hay);
    const encrypted = /encrypt|tls|https|at.?rest/.test(hay);
    const hasQueue = /bullmq|redis|queue|kafka|rabbit/.test(hay);
    const paginated = this.hasPagination(ctx);
    const idRoutes = ctx.apiDesign.modules.some((m) =>
      m.endpoints.some((e) => /:\w*id\b|\{id\}/i.test(e.path)),
    );
    const writeRoutes = ctx.apiDesign.modules.some((m) =>
      m.endpoints.some((e) => e.method !== 'GET'),
    );
    const rolesNoPerms = ctx.requirements.roles.filter(
      (r) => r.permissions.length === 0,
    );
    const sensitive = this.sensitiveEntities(ctx);
    const external = /oauth|google|github|stripe|paddle|paypal|twilio|sendgrid|s3|third.?party/.test(
      hay,
    );

    const threats: Threat[] = [];
    const add = (
      category: StrideCategory,
      component: string,
      threat: string,
      severity: Severity,
      mitigation: string,
    ) => threats.push({ category, component, threat, severity, mitigation });

    // ── Spoofing (authentication) ────────────────────────────────────────
    if (hasAuth && !hasRateLimit) {
      add(
        'spoofing',
        'Auth endpoints',
        'Login/register are exposed with no documented rate-limit or lockout, enabling credential stuffing and brute-force account takeover.',
        'high',
        'Rate-limit and lock out auth endpoints; add CAPTCHA/backoff and alert on spikes.',
      );
    }
    add(
      'spoofing',
      hasAuth ? 'Session tokens' : 'User identity',
      'Stolen or forged session tokens let an attacker impersonate a user (session hijacking / fixation).',
      'medium',
      'Use short-lived, httpOnly, Secure, SameSite cookies; rotate on privilege change; offer MFA.',
    );
    if (external) {
      add(
        'spoofing',
        'Third-party / OAuth integration',
        'A spoofed OAuth callback or unverified provider email can attach an attacker to another user’s account.',
        'medium',
        'Validate OAuth state, verify provider email, and pin redirect URIs.',
      );
    }

    // ── Tampering (integrity) ────────────────────────────────────────────
    if (writeRoutes) {
      add(
        'tampering',
        'Write endpoints (POST/PUT/PATCH)',
        'Unvalidated or over-permissive request bodies allow mass-assignment and tampering with fields the client shouldn’t control (e.g. role, price, ownerId).',
        'high',
        'Validate every DTO with an allowlist of writable fields; never bind request bodies straight to entities.',
      );
    }
    add(
      'tampering',
      'Data in transit',
      'Without enforced TLS, requests/responses can be intercepted and modified in transit (MITM).',
      encrypted ? 'low' : 'high',
      'Enforce HTTPS/TLS everywhere with HSTS; reject plaintext.',
    );

    // ── Repudiation (non-repudiation) ────────────────────────────────────
    if (!/audit|activity.?log/.test(hay)) {
      add(
        'repudiation',
        'Sensitive actions',
        'No audit trail is specified, so a user (or attacker) can deny having performed an action and incidents can’t be reconstructed.',
        'medium',
        'Add an append-only audit log (actor, action, timestamp, IP) for auth and sensitive mutations.',
      );
    }
    add(
      'repudiation',
      'Admin / staff actions',
      'Privileged operations without attribution make insider misuse hard to trace.',
      'low',
      'Log admin actions with the acting user and keep logs tamper-evident.',
    );

    // ── Information Disclosure (confidentiality) ──────────────────────────
    if (sensitive.length && !encrypted) {
      add(
        'information_disclosure',
        `Sensitive data (${sensitive.slice(0, 3).join(', ')})`,
        'Sensitive/PII columns are stored with no stated at-rest encryption; a database or backup leak exposes them directly.',
        'high',
        'Encrypt sensitive columns at rest, hash secrets (never store plaintext), and restrict backup access.',
      );
    }
    if (!paginated) {
      add(
        'information_disclosure',
        'List endpoints',
        'List endpoints without pagination or field filtering enable bulk data harvesting and enumeration.',
        'medium',
        'Paginate lists, return only necessary fields, and scope results to the caller.',
      );
    }
    add(
      'information_disclosure',
      'Error responses',
      'Verbose errors/stack traces can leak stack details, queries, or config to clients.',
      'low',
      'Return generic error bodies; log details server-side only (an AllExceptionsFilter is in place).',
    );

    // ── Denial of Service (availability) ─────────────────────────────────
    // The threat is identical at every tier; the control is not. A WAF is a
    // product to buy and tune, and recommending one to a team running a single
    // managed instance produces a mitigation nobody implements — so at the small
    // tier the control is the edge protection their host already includes.
    const small = this.tier(ctx) === 'small';
    add(
      'denial_of_service',
      'Public API',
      hasRateLimit
        ? 'Even with global throttling, expensive endpoints can be targeted to exhaust CPU/DB connections.'
        : 'No rate limiting means a single client can flood the API and exhaust resources.',
      hasRateLimit ? 'medium' : 'high',
      small
        ? 'Apply per-route rate limits in the application, cap request size and timeout, pool DB connections, and turn on the DDoS/CDN protection the host already provides.'
        : 'Apply per-route rate limits, request size/time limits, and DB connection pooling; put a WAF/CDN in front.',
    );
    if (!hasQueue) {
      add(
        'denial_of_service',
        'Heavy operations',
        'Heavy work (reports, exports, emails) running inline with requests can exhaust request threads under load.',
        'medium',
        // At the small tier the design has no queue *by decision*, so prescribing
        // one here would have the security artifact contradict the architecture
        // in the same package. Bound the work instead — which is the real control
        // at this volume, and the cheaper one.
        small
          ? 'Bound the work instead of queuing it: cap result-set and export sizes, set a request timeout, and run any long report on a schedule rather than on demand.'
          : 'Offload heavy work to a background queue with concurrency limits.',
      );
    }

    // ── Elevation of Privilege (authorization) ───────────────────────────
    if (rolesNoPerms.length) {
      add(
        'elevation_of_privilege',
        `Roles: ${rolesNoPerms.map((r) => r.name).join(', ')}`,
        'Roles have no explicit permissions, so access control is ambiguous — a user may reach actions above their level (broken access control).',
        'high',
        'Define per-endpoint authorization for every role and deny by default.',
      );
    }
    if (idRoutes) {
      add(
        'elevation_of_privilege',
        'Resource-by-id endpoints',
        'Endpoints keyed by an id are vulnerable to IDOR: a user can access or modify another user’s records by changing the id.',
        'high',
        'Enforce object-level ownership checks on every id-scoped route (not just authentication).',
      );
    }
    add(
      'elevation_of_privilege',
      'Admin surface',
      'Admin/staff routes without a strict role check let a normal user escalate to privileged operations.',
      'medium',
      'Guard admin routes with role/permission checks server-side; never rely on hidden UI.',
    );

    return threats;
  }

  // ── derivations ──────────────────────────────────────────────────────────

  private trustBoundaries(ctx: ThreatModelContext): string[] {
    const boundaries = ['Client (browser) ↔ API over the public internet'];
    boundaries.push('API ↔ Database (private network)');
    const hay = this.haystack(ctx);
    if (/redis|cache|queue|bullmq/.test(hay)) {
      boundaries.push('API ↔ Cache / queue (Redis)');
    }
    if (/oauth|google|github|stripe|paddle|twilio|sendgrid|s3/.test(hay)) {
      boundaries.push('API ↔ Third-party providers (OAuth / payments / email)');
    }
    if (ctx.requirements.roles.some((r) => /admin|staff|support/i.test(r.name))) {
      boundaries.push('Admin/staff console ↔ API (privileged surface)');
    }
    if (ctx.systemDesign.architecture === 'microservices') {
      boundaries.push('Service ↔ service (internal network)');
    }
    return boundaries;
  }

  private assumptions(): string[] {
    return [
      'This model covers the application tier; physical, cloud-account, and network infrastructure security is out of scope.',
      'TLS terminates at the edge and secrets are held in environment variables / a secret manager, not in source.',
      'The database and cache are not exposed to the public internet.',
      'Threats are rated on likelihood × impact for a typical early-stage deployment; re-assess as scale and data sensitivity grow.',
    ];
  }

  private sensitiveEntities(ctx: ThreatModelContext): string[] {
    const re =
      /user|account|password|secret|token|email|phone|address|payment|invoice|card|ssn|profile|credential|billing/i;
    const hits = new Set<string>();
    for (const e of ctx.databaseDesign.entities) {
      if (re.test(e.name) || e.columns.some((c) => re.test(c.name))) {
        hits.add(e.name);
      }
    }
    return Array.from(hits);
  }

  private hasPagination(ctx: ThreatModelContext): boolean {
    return ctx.apiDesign.modules.some((m) =>
      m.endpoints.some(
        (e) =>
          e.method === 'GET' &&
          e.requestSchema.some((f) => f.name === 'page' || f.name === 'limit'),
      ),
    );
  }

  private haystack(ctx: ThreatModelContext): string {
    return [
      ctx.idea,
      ctx.systemDesign.architecture,
      ...ctx.systemDesign.techStack.map((t) => `${t.layer} ${t.technology}`),
      ...ctx.requirements.nonFunctional.map(
        (n) => `${n.category} ${n.description}`,
      ),
      ...ctx.apiDesign.modules.map((m) => m.name),
    ]
      .join(' ')
      .toLowerCase();
  }

  /** Highest-severity first, then grouped by STRIDE order for a stable read. */
  private sortThreats(threats: Threat[]): Threat[] {
    const sev: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    const order = STRIDE_CATEGORIES.map((c) => c.category);
    return [...threats].sort(
      (a, b) =>
        sev[a.severity] - sev[b.severity] ||
        order.indexOf(a.category) - order.indexOf(b.category),
    );
  }

  private summary(ctx: ThreatModelContext, threats: Threat[]): string {
    const high = threats.filter(
      (t) => t.severity === 'high' || t.severity === 'critical',
    ).length;
    return `STRIDE threat model of a ${ctx.systemDesign.architecture.replace(
      /_/g,
      ' ',
    )} design with ${ctx.systemDesign.services.length} services and ${
      ctx.databaseDesign.entities.length
    } entities: ${threats.length} threats identified across the six categories${
      high ? `, ${high} high/critical` : ''
    }. Prioritise authentication, authorization, and data-protection controls before launch.`;
  }

  private strings(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out = v.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    return out.length ? out : undefined;
  }
}
