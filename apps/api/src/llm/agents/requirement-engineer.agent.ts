import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  SLOT_KEYS,
  regulationsForMarket,
  screenRequirementDocument,
  untrusted,
  untrustedField,
  type BusinessAnalysis,
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
  /**
   * The Business Analysis, when one has been generated. It grounds the document
   * in the business case rather than jumping straight from raw answers to
   * requirements: the problem statement drives the executive summary, the
   * segments inform the roles, and the MVP assessment shapes priorities.
   *
   * **Optional on purpose.** The analysis feeds this stage but does not gate it
   * (`BusinessAnalysisService` is a standalone stage), so every existing project
   * and every plan-mode run must still produce a document without one.
   */
  businessAnalysis?: BusinessAnalysis;
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
    'Data-protection requirements follow the project\'s stated target market, never',
    'habit. Cite only the regime named in the scoping facts below; if no market was',
    'stated, write the compliance requirement generically (protect personal data,',
    'confirm the hosting region) and record the applicable regime as an assumption',
    'for the client to confirm. Never cite GDPR, HIPAA, CCPA or any other law that',
    'the stated market does not actually invoke — a wrong law is worse than none.',
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
    const doc = await this.generateArtifact<RequirementDocument>({
      label: 'Requirement doc',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) =>
        this.normalize(sessionId, generatedAt, raw, ctx, openQuestions),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
    });

    // Screen the client-facing prose on the way out. This runs on BOTH paths: the
    // deterministic build composes its summary from the client's own words, so a
    // link pasted into the interview reaches the share page with no model involved
    // at all.
    const { document, removed } = screenRequirementDocument(doc);
    if (removed.length > 0) {
      this.logger.warn(
        `Requirement doc: stripped ${removed.length} link(s) from client-facing sections — possible prompt injection: ${removed.join(', ')}`,
      );
    }
    return document;
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

  /**
   * The data-protection regime to cite, resolved from the target-market slot in
   * code rather than recalled by the model.
   *
   * With no stated market this returns an instruction to leave the question open
   * — which is the whole point. The model's untutored default is GDPR/HIPAA
   * regardless of who the client is, and for this product's market that is both
   * wrong and expensive to be wrong about.
   */
  private complianceHint(ctx: RequirementContext): string {
    const slot = ctx.slots?.target_market;
    const market = slot && !slot.na ? slot.value.trim() : '';
    const regime = regulationsForMarket(market);
    if (!regime) {
      return [
        '\nCOMPLIANCE — no target market has been confirmed for this project.',
        'Do NOT name any specific data-protection law. Write the compliance requirement generically',
        '(protect personal data, agree the hosting region) and add an assumption asking the client to',
        'confirm the country/region so the applicable regime can be named.',
      ].join('\n');
    }
    return [
      `\nCOMPLIANCE — the stated target market is ${untrusted(market)}. The regimes that apply:`,
      ...regime.laws.map((l) => `- ${l}`),
      `Data residency: ${regime.dataResidency}`,
      regime.note,
      'Cite these and only these. Do not add a law this market does not invoke.',
    ].join('\n');
  }

  private buildPrompt(ctx: RequirementContext): string {
    // The transcript is fenced as one block rather than per answer: every line of
    // it is either our question or the client's words, and a single fence is
    // harder to get wrong than one per turn.
    const qa = untrusted(
      ctx.history.map((h) => `Q: ${h.question.prompt}\nA: ${h.answer}`).join('\n'),
    );

    // Scoping facts from the slot pass, minus the commercial ones (budget /
    // timeline) — those must not appear in this document at all.
    const slotLines = SLOT_KEYS.filter(
      (k) => k !== 'budget_range' && k !== 'timeline',
    )
      .map((k) => {
        const s = ctx.slots?.[k];
        if (!s || s.na || !s.value.trim()) return '';
        return `- ${k}: ${untrusted(s.value)}${s.source === 'inferred' ? ' (inferred)' : ''}`;
      })
      .filter(Boolean)
      .join('\n');

    const oqLines = (ctx.openQuestions ?? [])
      .map((q) => `- ${untrusted(q.questionForClient)}`)
      .join('\n');

    const domain = ctx.intent?.domain ?? slotText(ctx.slots?.business_domain);
    const commonScope = domainCommonScope(domain);

    return [
      businessAnalysisBrief(ctx.businessAnalysis),
      untrustedField('Idea', ctx.idea),
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
      this.complianceHint(ctx),
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

    // Offline, the applicable regime is still knowable when the client stated a
    // market — it's a table lookup, not a judgement call. With no market stated
    // the fallback names no law at all, which is the honest answer.
    const marketSlot = ctx.slots?.target_market;
    const regime = regulationsForMarket(
      marketSlot && !marketSlot.na ? marketSlot.value : undefined,
    );
    if (regime) {
      nonFunctional.push({
        id: `NFR-${nonFunctional.length + 1}`,
        category: 'security',
        description: `Personal data handling follows ${regime.laws.join(', ')}. ${regime.dataResidency}`,
      });
    }

    // A role entry may arrive as a full phrase ("Shipping staff who pack and
    // dispatch orders"), so the short lead becomes the name and the client's own
    // wording is preserved as the description rather than being thrown away.
    const roles: UserRole[] = summary.users.map((entry) => {
      const name = shortPhrase(entry, 40) || entry;
      return {
        name,
        description:
          name === entry.trim()
            ? `${name} role identified during the requirements interview.`
            : entry.trim(),
        permissions: [],
      };
    });

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

/**
 * A short requirement title.
 *
 * A workflow line usually leads with its own label ("Order placement: Customer
 * browses the catalog, adds items…"), so the label is the title and the rest
 * stays in the description. Only when there is no such lead does this fall back
 * to a hard truncation, which is what every title used to be.
 */
/**
 * The business-case brief that leads the prompt, when a Business Analysis
 * exists.
 *
 * It goes FIRST deliberately: the point of the stage is that the model reasons
 * about the business before it starts specifying software, and a brief buried
 * under the raw transcript would just be more context rather than a frame.
 *
 * Only the grounded sections cross. The competitor list and market read are
 * explicitly excluded — they are the analyst's unverified recollection, they
 * have no bearing on what the system must do, and letting them reach a document
 * the client reads would launder a guess into a requirement.
 */
function businessAnalysisBrief(analysis: BusinessAnalysis | undefined): string {
  if (!analysis) return '';
  const mvp = analysis.mvp;
  return [
    'BUSINESS CASE (established before requirements — ground the document in this):',
    `- Problem: ${analysis.problem.problem}`,
    `- Who has it: ${analysis.problem.whoHasIt}`,
    `- What they do today: ${analysis.problem.currentAlternative}`,
    `- Why choose this: ${analysis.usp.statement}`,
    analysis.segments.length
      ? `- User segments: ${analysis.segments
          .map((s) => `${s.name} (needs: ${s.jobToBeDone})`)
          .join('; ')}`
      : '',
    `- MVP assessment: ${mvp.verdict}${mvp.reasoning ? ` — ${mvp.reasoning}` : ''}`,
    mvp.recommendedCore.length
      ? `- Belongs in release one (prioritize as "must"): ${mvp.recommendedCore.join('; ')}`
      : '',
    mvp.deferSuggestions.length
      ? `- Can wait (prioritize as "should"/"could", or list as out-of-scope): ${mvp.deferSuggestions.join('; ')}`
      : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

function truncateTitle(text: string): string {
  const trimmed = text.trim();
  // Prefer a real clause boundary — the label before a colon, else the first
  // comma clause. Cutting at a fixed character count instead produced titles like
  // "Inventory decrement on order confirmation, preventing ove…", which stops
  // mid-word in the one line a client actually scans.
  for (const separator of [/[:—–]|\s-\s/, /,/]) {
    const lead = trimmed.split(separator)[0]?.trim() ?? '';
    if (lead && lead !== trimmed && lead.length <= 60 && wordCount(lead) >= 2) {
      return lead;
    }
  }
  const single = trimmed.replace(/\.$/, '');
  if (single.length <= 80) return single;
  return `${single.slice(0, 57)}…`;
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

function capitalizeFirst(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * Reduce a raw answer to a short phrase safe to drop into a list or a clause.
 *
 * Slot and summary text is the client's own words — often a labelled multi-clause
 * answer ("Fashion — women's clothing, DTC brand selling through a web
 * storefront…"). Splicing that whole string into a sentence frame is what made the
 * executive summary ungrammatical, so anything used *inside* a sentence is cut to
 * its leading clause first.
 */
function shortPhrase(text: string, maxChars = 60): string {
  const lead = text
    .split(/[:.;—–]|\s-\s/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (!lead) return '';
  if (lead.length <= maxChars) return lead;
  const cut = lead.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * One capability, named for the middle of a sentence ("Core capabilities include
 * X, Y and Z").
 *
 * Unlike `shortPhrase` this never emits a trailing ellipsis: a clipped clause in
 * a prose sentence produced "…lifecycle from pending through packed to…." — an
 * ellipsis immediately followed by the sentence's own full stop. A capability is
 * better named by its own leading clause than by the first 60 characters of its
 * description, so the text is cut at a clause boundary and, failing that, the
 * whole capability is dropped rather than shown mangled.
 */
function capabilityPhrase(text: string): string {
  const lead = (text.split(/[:;—–]|\s-\s/)[0] ?? '').replace(/\s+/g, ' ').trim();
  const clause = (lead.split(',')[0] ?? '').trim();
  const best = clause.length >= 8 ? clause : lead;
  const cleaned = best.replace(/[.,\s]+$/, '');
  return cleaned.length <= 70 && wordCount(cleaned) >= 2 ? cleaned : '';
}

/**
 * Render the project goal as a STANDALONE sentence.
 *
 * The previous frame — `It lets them ${goal}` — assumed the goal was a verb
 * phrase ("book appointments online"). A goal that is a noun phrase, which is what
 * an industry or domain answer always is, produced "It lets them fashion —
 * Fashion e-commerce — women's clothing…". Emitting the goal as its own sentence
 * is grammatical for both shapes, so the frame is gone rather than patched.
 */
function goalSentence(goal: string): string {
  const first = goal.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  if (wordCount(first) < 3) return '';
  const trimmed = first.length > 200 ? `${shortPhrase(first, 200)}` : first;
  const sentence = capitalizeFirst(trimmed.replace(/[.\s]+$/, ''));
  return sentence ? `${sentence}.` : '';
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * A jargon-free, 3–4 sentence executive summary composed from whatever scoping
 * facts are available (slots → interview summary → the raw idea), so the section
 * renders on the offline path with no LLM.
 */
function buildExecutiveSummary(ctx: RequirementContext): string {
  const { summary, idea } = ctx;
  const slots = ctx.slots ?? {};
  const domain = shortPhrase(
    (ctx.intent?.domain || slotText(slots.business_domain)).trim(),
    40,
  );
  // The split role list is preferred over the raw slot text: the slot holds one
  // sentence about who uses the system, which reads badly mid-clause.
  const users =
    joinList(summary.users.map((u) => shortPhrase(u, 40))) ||
    shortPhrase(slotText(slots.target_users_roles), 60) ||
    'its users';
  const features = summary.features
    .slice(0, 3)
    .map(capabilityPhrase)
    .filter(Boolean);

  const parts: string[] = [];
  parts.push(
    domain
      ? `This is a ${domain} solution built for ${users}.`
      : `This solution is built for ${users}.`,
  );
  const goal = goalSentence((summary.goal || idea).trim());
  if (goal) parts.push(goal);
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
