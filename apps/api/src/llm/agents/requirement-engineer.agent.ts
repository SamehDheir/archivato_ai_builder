import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  SLOT_KEYS,
  type BusinessRule,
  type FunctionalRequirement,
  type IntentAnalysis,
  type InterviewExchange,
  type NonFunctionalRequirement,
  type OpenQuestion,
  type OutOfScopeItem,
  type RequirementAssumption,
  type RequirementDocument,
  type RequirementsSummary,
  type SlotMap,
  type SlotValue,
  type UserRole,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';
import { domainCommonScope } from '../../interview/slots';

/** Everything the Requirement Engineer needs from a confirmed interview. */
export interface RequirementContext {
  idea: string;
  intent: IntentAnalysis | null;
  history: InterviewExchange[];
  summary: RequirementsSummary;
  /**
   * The derived slot snapshot from the scoping interview (R6/R7). Optional — a
   * pure plan-mode / offline run fills no slots, so the agent must tolerate an
   * empty or absent map. Used as extra scoping context and to seed the executive
   * summary + out-of-scope in the deterministic fallback.
   */
  slots?: SlotMap;
  /**
   * Gaps the owner couldn't answer during the slot-filling interview (R6),
   * carried through so the document folds them into "Assumptions & open
   * questions" (each phrased as an assumed default with its impact-if-wrong).
   */
  openQuestions?: OpenQuestion[];
}

/**
 * Owns the Requirements stage: turns a confirmed interview into a formal,
 * structured Requirement Document — a **two-audience** artifact (R7). The
 * client-facing sections (executive summary, functional requirements, roles,
 * out-of-scope, assumptions) are written in plain business language; the
 * technical sections (non-functional, business rules, constraints) may be
 * precise. Tries the LLM, validates the shape, and falls back to a deterministic
 * build from the interview data so the stage always yields a usable document
 * (and demos cleanly in mock mode).
 */
@Injectable()
export class RequirementEngineerAgent extends BaseAgent {
  readonly role = AgentRole.RequirementEngineer;

  private readonly logger = new Logger(RequirementEngineerAgent.name);

  protected readonly systemPrompt = [
    'You are a meticulous Requirement Engineer who turns a confirmed discovery',
    'interview into a formal Requirement Document that is a CLIENT-FACING scoping',
    'artifact — read by the non-technical business owner deciding whether to sign,',
    'and by the dev team that will build it.',
    'Method: extract every requirement the interview actually supports; make each',
    'one atomic (one testable capability), unambiguous, and free of solution',
    'detail unless the user specified it. Deduplicate overlapping answers.',
    'Two audiences, one document: the executive summary, functional requirements,',
    'roles, out-of-scope and assumptions are for the CLIENT — write them in plain',
    'business language and NEVER use jargon like "CRUD", "endpoint", "schema", or',
    '"API" there. Phrase functional requirements in the user-outcome voice',
    '("Customers can track their orders in real time"), not "the system shall".',
    'The non-functional requirements, business rules and constraints may be',
    'technical, and should use impact language ("handles 10,000 concurrent users',
    'at peak") over standards language where the interview allows.',
    'Out-of-scope is a first-class section that protects the dev shop from scope',
    'creep: name 3–6 capabilities explicitly NOT included, drawn from what the',
    'interview raised then deferred AND from what a buyer typically expects in this',
    'kind of product but did not request.',
    'Conventions: functional requirements are ids FR-1.., non-functional NFR-1..,',
    'business rules BR-1.. — numbered sequentially with no gaps. Assign priority',
    '(must/should/could) by how essential the capability is to the core value;',
    'core features are "must". Roles carry concrete, least-privilege permissions.',
    'Never mention budget or timeline anywhere in the document — those belong to',
    'the roadmap and cost deliverables, not here.',
    'Output standard: every requirement is specific and verifiable, traceable to',
    'the interview, and non-redundant. Never invent scope the interview did not',
    'establish; surface genuine gaps as assumptions.',
    'Return ONLY strict JSON matching the requested schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: RequirementContext,
  ): Promise<RequirementDocument> {
    const generatedAt = new Date().toISOString();
    // The open questions come straight from the interview's slot pass — not from
    // the model — so they're folded into the assumptions on BOTH paths, and the
    // raw client-question list is attached verbatim too.
    const openQuestions = ctx.openQuestions ?? [];
    try {
      const raw = await this.thinkJson<Partial<RequirementDocument>>(
        this.buildPrompt(ctx),
      );
      if (this.isValid(raw)) {
        return this.normalize(sessionId, generatedAt, raw, ctx, openQuestions);
      }
      this.logger.debug('Requirement doc malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Requirement generation failed; using fallback: ${err}`);
    }
    return this.buildDeterministic(sessionId, generatedAt, ctx);
  }

  /**
   * Take a valid LLM document and guarantee the R7 sections are present and
   * consistent: backfill the executive summary / out-of-scope deterministically
   * if the model skipped them, and always fold the interview's open questions
   * into the assumptions so a stated gap is never dropped.
   */
  private normalize(
    sessionId: string,
    generatedAt: string,
    raw: Partial<RequirementDocument>,
    ctx: RequirementContext,
    openQuestions: OpenQuestion[],
  ): RequirementDocument {
    const executiveSummary =
      typeof raw.executiveSummary === 'string' && raw.executiveSummary.trim()
        ? raw.executiveSummary.trim()
        : buildExecutiveSummary(ctx);

    const outOfScope = sanitizeOutOfScope(raw.outOfScope);
    const assumptions = Array.isArray(raw.assumptions)
      ? raw.assumptions.filter((a): a is string => typeof a === 'string')
      : ctx.summary.assumptions;

    // `isValid` only guarantees functional/nonFunctional/roles are arrays, so a
    // conforming-but-partial LLM doc can omit these two — leaving them `undefined`
    // would crash every consumer (`doc.businessRules.length`, the markdown
    // exporters). Coerce to a safe shape here, the same as `assumptions`.
    const businessRules = Array.isArray(raw.businessRules)
      ? raw.businessRules
      : [];
    const constraints = Array.isArray(raw.constraints)
      ? raw.constraints.filter((c): c is string => typeof c === 'string')
      : ctx.summary.constraints;

    const modelAssumptions = mergeOpenQuestions(
      sanitizeAssumptions(raw.assumptionsAndOpenQuestions),
      openQuestions,
    );

    return {
      ...(raw as RequirementDocument),
      sessionId,
      generatedAt,
      executiveSummary,
      assumptions,
      businessRules,
      constraints,
      outOfScope: outOfScope.length ? outOfScope : fallbackOutOfScope(ctx),
      assumptionsAndOpenQuestions: modelAssumptions.length
        ? modelAssumptions
        : deterministicAssumptions(ctx, openQuestions),
      openQuestions,
    };
  }

  private buildPrompt(ctx: RequirementContext): string {
    const qa = ctx.history
      .map((h) => `Q: ${h.question.prompt}\nA: ${h.answer}`)
      .join('\n');

    // Scoping facts from the slot pass, minus the commercial ones (budget /
    // timeline) — those must not appear in this document at all.
    const slotLines = SLOT_KEYS.filter(
      (k) => k !== 'budget_range' && k !== 'timeline',
    )
      .map((k) => {
        const s = ctx.slots?.[k];
        if (!s || s.na || !s.value.trim()) return '';
        return `- ${k}: ${s.value.trim()}${s.source === 'inferred' ? ' (inferred)' : ''}`;
      })
      .filter(Boolean)
      .join('\n');

    const oqLines = (ctx.openQuestions ?? [])
      .map((q) => `- ${q.questionForClient}`)
      .join('\n');

    const domain = ctx.intent?.domain ?? slotText(ctx.slots?.business_domain);
    const commonScope = domainCommonScope(domain);

    return [
      `Idea: ${ctx.idea}`,
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      ctx.intent && ctx.intent.coreCapabilities.length
        ? `Core capabilities identified: ${ctx.intent.coreCapabilities.join(', ')}`
        : '',
      '',
      'Confirmed interview transcript:',
      qa,
      slotLines ? '\nScoping facts captured (context — do NOT restate budget or timeline):' : '',
      slotLines,
      oqLines
        ? '\nGaps the owner could not answer (fold each into assumptionsAndOpenQuestions as an assumed default):'
        : '',
      oqLines,
      `\nCapabilities buyers typically expect in this kind of product — list any NOT being built under outOfScope: ${commonScope.join(', ')}.`,
      '',
      'Produce the Requirement Document as JSON with these keys:',
      '- executiveSummary: 3–4 plain sentences for a NON-TECHNICAL client — who the system serves, what it lets them do, and the business outcome. No technical jargon.',
      '- functional[]: {id (FR-n), title (short), description (a user-outcome sentence, e.g. "Customers can track their orders in real time" — never "the system shall…"), priority (must|should|could)}.',
      '- roles[]: {name, description, permissions[] (concrete, least-privilege actions this role may perform, in plain language)}.',
      '- outOfScope[]: {item, reason?} — 3–6 capabilities explicitly NOT included (deferred/rejected in the interview, or typically expected in this domain but not requested).',
      '- assumptionsAndOpenQuestions[]: {assumption, impactIfWrong} — assumptions you made to fill genuine gaps, plus each open question above phrased as an assumed default, each with the concrete consequence if it is wrong.',
      '- nonFunctional[]: {id (NFR-n), category (e.g. security, performance, scalability, availability, usability), description (a measurable quality attribute in impact language)}.',
      '- businessRules[]: {id (BR-n), description (a constraint or policy the system must enforce)}.',
      '- constraints[]: hard technical/business constraints stated by the user (strings).',
      '- assumptions[]: the same assumptions as plain strings (kept for compatibility).',
    ]
      .filter((line) => line !== '')
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
    const openQuestions = ctx.openQuestions ?? [];

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
      executiveSummary: buildExecutiveSummary(ctx),
      functional,
      nonFunctional,
      roles,
      businessRules,
      constraints: summary.constraints,
      assumptions: summary.assumptions,
      outOfScope: fallbackOutOfScope(ctx),
      assumptionsAndOpenQuestions: deterministicAssumptions(ctx, openQuestions),
      openQuestions,
    };
  }
}

// ── pure helpers (shared by the LLM-normalize and deterministic paths) ───────

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

/** The value of a filled, applicable slot, or '' when absent / N/A. */
function slotText(slot: SlotValue | undefined): string {
  return slot && !slot.na ? slot.value.trim() : '';
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  const parts = items.map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function lowerFirst(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/**
 * A jargon-free, 3–4 sentence executive summary composed from whatever scoping
 * facts are available (slots → interview summary → the raw idea), so the section
 * renders on the offline path with no LLM.
 */
function buildExecutiveSummary(ctx: RequirementContext): string {
  const { summary, idea } = ctx;
  const slots = ctx.slots ?? {};
  const domain = (ctx.intent?.domain || slotText(slots.business_domain)).trim();
  const users =
    slotText(slots.target_users_roles) || joinList(summary.users) || 'its users';
  const goal = (summary.goal || idea).trim();
  const features = summary.features.slice(0, 3);

  const parts: string[] = [];
  parts.push(
    domain
      ? `This is a ${domain} solution built for ${users}.`
      : `This solution is built for ${users}.`,
  );
  if (goal) parts.push(`It lets them ${lowerFirst(goal)}.`);
  if (features.length) parts.push(`Core capabilities include ${joinList(features)}.`);
  parts.push(
    'The result is a system that supports their day-to-day work and is ready to grow with the business.',
  );
  return parts.join(' ');
}

/**
 * The out-of-scope list for the deterministic path: the capabilities a buyer
 * typically expects in this domain but that were not requested. Always non-empty
 * (falls back to a generic list) so the section renders offline.
 */
function fallbackOutOfScope(ctx: RequirementContext): OutOfScopeItem[] {
  const domain = ctx.intent?.domain || slotText(ctx.slots?.business_domain);
  return domainCommonScope(domain)
    .slice(0, 6)
    .map((item) => ({
      item,
      reason:
        'Commonly expected in this kind of product, but not requested in the discovery call — can be added in a later phase.',
    }));
}

/** Phrase one interview open question as an assumed default + its impact. */
function openQuestionToAssumption(q: OpenQuestion): RequirementAssumption {
  return {
    assumption: `Assumed a sensible default pending the client's answer: ${q.questionForClient}`,
    impactIfWrong: 'Scope, timeline, or cost may change once the client confirms.',
  };
}

/** Append the interview's open questions to an assumption list, de-duplicated. */
function mergeOpenQuestions(
  base: RequirementAssumption[],
  openQuestions: OpenQuestion[],
): RequirementAssumption[] {
  const key = (a: RequirementAssumption) => a.assumption.trim().toLowerCase();
  const seen = new Set(base.map(key));
  const extra = openQuestions
    .map(openQuestionToAssumption)
    .filter((a) => !seen.has(key(a)));
  return [...base, ...extra];
}

/** The deterministic "assumptions & open questions": summary assumptions + gaps. */
function deterministicAssumptions(
  ctx: RequirementContext,
  openQuestions: OpenQuestion[],
): RequirementAssumption[] {
  const fromSummary: RequirementAssumption[] = ctx.summary.assumptions.map(
    (assumption) => ({
      assumption,
      impactIfWrong:
        'If this is inaccurate, related requirements may need to be revised.',
    }),
  );
  return mergeOpenQuestions(fromSummary, openQuestions);
}

function sanitizeOutOfScope(value: unknown): OutOfScopeItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as { item?: unknown; reason?: unknown };
      const item = typeof r.item === 'string' ? r.item.trim() : '';
      if (!item) return null;
      const reason =
        typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : undefined;
      return reason ? { item, reason } : { item };
    })
    .filter((x): x is OutOfScopeItem => x !== null);
}

function sanitizeAssumptions(value: unknown): RequirementAssumption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as { assumption?: unknown; impactIfWrong?: unknown };
      const assumption = typeof r.assumption === 'string' ? r.assumption.trim() : '';
      if (!assumption) return null;
      const impactIfWrong =
        typeof r.impactIfWrong === 'string' ? r.impactIfWrong.trim() : '';
      return { assumption, impactIfWrong };
    })
    .filter((x): x is RequirementAssumption => x !== null);
}
