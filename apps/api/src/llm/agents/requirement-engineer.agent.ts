import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  extractionGapAssumption,
  isAssumptionKind,
  SLOT_KEYS,
  parseLatencySeconds,
  parseUptimePercent,
  regulationsForMarket,
  resolveServiceTargets,
  screenRequirementDocument,
  serviceTargetInput,
  serviceTargetSentence,
  serviceTargetsPromptBlock,
  transcriptSuggestsBusinessRules,
  unsourcedRoleAssumption,
  unsourcedRoleNames,
  untrusted,
  untrustedField,
  withAssumptionKinds,
  type ArtifactLanguage,
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
  type ServiceTargets,
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
 * Output budget for one requirement document.
 *
 * Caught by the `describeShape` diagnostic the hour it was added: a real run
 * logged `Model returned: { executiveSummary, functional }` — nine sections
 * requested, two delivered, cut off right after the `functional` array. R7 is
 * what pushed it over the old 2048: the document gained an executive summary,
 * an out-of-scope list and an assumptions/open-questions list, on top of
 * functional + non-functional + roles + business rules + constraints.
 *
 * Note this artifact is **first in the chain** — every later stage reads it — so
 * its truncation is the most expensive of the four. `isValid` gates on
 * `nonFunctional` and `roles`, both of which follow `functional` in the schema,
 * so the whole document was discarded for the template.
 *
 * 5120 matches the other large artifacts; the TPM warning on
 * `DEFAULT_MAX_TOKENS` applies.
 */
const REQUIREMENTS_MAX_TOKENS = 5120;

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
    'technical, and should use impact language ("pages respond in under two',
    'seconds") over standards language where the interview allows.',
    // The example here used to read "handles 10,000 concurrent users at peak",
    // which taught the model the exact substitution described below: it modelled
    // a concurrency claim as the natural way to state scale, so a stated total
    // came back relabelled. An example is an instruction.
    'Registered users and concurrent users are DIFFERENT quantities and must never',
    'be swapped. "Up to 1,000 users" is a total registered-user count; writing it',
    'as "1,000 concurrent users" silently multiplies the load the system is sized',
    'for. State the client\'s figure with the meaning they gave it, and only call a',
    'number concurrent when the client did, or when the agreed figures below give',
    'you a concurrency figure explicitly derived for that purpose.',
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
    'Synthesize, never transcribe. Do NOT copy sentences verbatim out of an',
    'answer: read the answer, then write the discrete, atomic items it contains in',
    'your own words. A field that reproduces a paragraph of the transcript is',
    'wrong even when the paragraph is relevant — and pasting the same text into',
    'two different fields is the single most visible defect in this document.',
    'Each field is derived from its own source: roles come from who the client',
    'said uses the system, constraints from limits they stated, scale figures from',
    'the volume they quoted. Never fill one field from another field\'s answer.',
    'If the source text carries markup artifacts (LaTeX like $\\rightarrow$,',
    'markdown, placeholder syntax), render what the reader was meant to see —',
    'never pass the markup through literally.',
    'Roles are only those the client named or that a described workflow plainly',
    'requires. If you infer a role they did not name, it must also appear in',
    'assumptionsAndOpenQuestions as an inference — never presented as stated fact.',
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
    // Resolved here as well as inside `generateArtifact`, because the provenance
    // notes below are appended *after* it returns and compose their own
    // sentences. Both reads hit the same memoized thunk, so this is one lookup.
    const language = await this.artifactLanguage();
    // The same pure resolution the Product Manager and the System Architect run.
    // None of the three reads another's artifact; they agree because they all
    // derive from the interview rather than each estimating for itself.
    const targets = resolveServiceTargets(serviceTargetInput(ctx), language);
    const doc = await this.generateArtifact<RequirementDocument>({
      label: 'Requirement doc',
      prompt: this.buildPrompt(ctx, targets),
      isValid: (raw) => this.isValid(raw),
      accept: (raw) =>
        this.normalize(sessionId, generatedAt, raw, ctx, openQuestions),
      fallback: (lang) =>
        this.buildDeterministic(sessionId, generatedAt, ctx, targets, lang),
      options: { maxTokens: REQUIREMENTS_MAX_TOKENS },
    });

    // Screen the client-facing prose on the way out. This runs on BOTH paths: the
    // deterministic build composes its summary from the client's own words, so a
    // link pasted into the interview reaches the share page with no model involved
    // at all.
    const { document, removed } = screenRequirementDocument(
      this.withProvenanceNotes(doc, ctx, language),
    );
    if (removed.length > 0) {
      this.logger.warn(
        `Requirement doc: stripped ${removed.length} link(s) from client-facing sections — possible prompt injection: ${removed.join(', ')}`,
      );
    }
    return document;
  }

  /**
   * Add field-provenance notes to the finished document, on BOTH paths.
   *
   * This is the runtime backstop for two of the three reported failure modes.
   * It never edits or deletes the document's content — it only *appends* to the
   * assumptions list, which is the section for "here is something we could not
   * settle". Both notes are conservative by construction: each fires only on
   * evidence the client's own words provide.
   *
   *  - **Invented roles.** A role name whose distinctive words do not all appear
   *    in what the client said about who uses the system is surfaced as an
   *    inference, with the cost of being wrong attached — the role is kept
   *    (it may be a correct inference from a workflow), but it is no longer
   *    asserted as stated fact. The haystack is the roles source specifically,
   *    NOT the transcript: a client who said "customer service is not a separate
   *    role yet" must not have that role laundered into "sourced" because the
   *    phrase appears in a negative sentence.
   *  - **Silently-empty business rules.** An empty rules section is labelled as
   *    an extraction gap *only when the transcript actually carries policy
   *    language* — so the note reads as the tool reporting on itself, never as a
   *    speculative claim about the client's business.
   */
  private withProvenanceNotes(
    doc: RequirementDocument,
    ctx: RequirementContext,
    language: ArtifactLanguage,
  ): RequirementDocument {
    const extra: RequirementAssumption[] = [];

    const roleNames = (doc.roles ?? []).map((r) => r.name);
    const invented = unsourcedRoleNames(roleNames, statedRolesText(ctx));
    for (const name of invented) {
      extra.push(unsourcedRoleAssumption(name, language));
    }

    const noRules = (doc.businessRules ?? []).length === 0;
    if (noRules && transcriptSuggestsBusinessRules(transcriptText(ctx))) {
      extra.push(extractionGapAssumption(language));
    }

    if (extra.length === 0) return doc;
    const base = doc.assumptionsAndOpenQuestions ?? [];
    const seen = new Set(base.map((a) => a.assumption.trim().toLowerCase()));
    // Classified here as well as in `normalize`, because this runs AFTER it: an
    // entry appended at this point would otherwise be the only one in the list
    // with no `kind`. `withAssumptionKinds` never overwrites an existing one, so
    // running it over the whole merged list is idempotent for the rest.
    const merged = withAssumptionKinds([
      ...base,
      ...extra.filter((a) => !seen.has(a.assumption.trim().toLowerCase())),
    ]);
    return { ...doc, assumptionsAndOpenQuestions: merged };
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

    // `withAssumptionKinds` is the backstop, not the primary defence: the prompt
    // asks the model to label each entry, and a label it supplied is kept. This
    // only fills the gap for an unlabelled reply — where an unmade choice between
    // two named platforms would otherwise render as a settled assumption.
    const modelAssumptions = withAssumptionKinds(
      mergeOpenQuestions(
        sanitizeAssumptions(raw.assumptionsAndOpenQuestions),
        openQuestions,
      ),
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
        : withAssumptionKinds(deterministicAssumptions(ctx, openQuestions)),
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

  private buildPrompt(ctx: RequirementContext, targets: ServiceTargets): string {
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
      serviceTargetsPromptBlock(targets),
      '',
      'Produce the Requirement Document as JSON with these keys:',
      '- executiveSummary: 3–4 plain sentences for a NON-TECHNICAL client — who the system serves, what it lets them do, and the business outcome. No technical jargon.',
      '- functional[]: {id (FR-n), title (short), description (a user-outcome sentence, e.g. "Customers can track their orders in real time" — never "the system shall…"), priority (must|should|could)}.',
      '- roles[]: {name, description, permissions[] (concrete, least-privilege actions this role may perform, in plain language)}.',
      '- outOfScope[]: {item, reason?} — 3–6 capabilities explicitly NOT included (deferred/rejected in the interview, or typically expected in this domain but not requested).',
      '- assumptionsAndOpenQuestions[]: {assumption, impactIfWrong, kind} — assumptions you made to fill genuine gaps, plus each open question above, each with the concrete consequence if it is wrong.',
      '  kind is "assumption" or "open_question", and the distinction matters to the client:',
      '  * "assumption" — a low-stakes default it is reasonable to proceed on, where being wrong is cheap to correct (e.g. standard TLS encryption is sufficient when no compliance regime was named).',
      '  * "open_question" — a decision that materially changes scope, cost or integration work depending on which way it goes, and that only the CLIENT can settle: choosing between two named third-party platforms, a hosting region, a compliance framework, a payment provider.',
      '  Never resolve an open_question into a settled-sounding assumption. "Either Microsoft Teams or Slack will be used for notifications" is NOT an assumption — the client may use one, the other, or neither, and each answer is different integration work. Write it as the question it is.',
      '  If you must pick one to keep the design moving, say plainly in the text that it is a placeholder pending the client\'s choice, not a recommendation.',
      '- nonFunctional[]: {id (NFR-n), category (e.g. security, performance, scalability, availability, usability), description (a measurable quality attribute in impact language)}.',
      '  Response-time, availability and user-volume requirements MUST use the',
      '  agreed figures above verbatim — other documents in this package quote the',
      '  same numbers, and a different one here is a contradiction the client sees.',
      '  Keep distinct measurements in SEPARATE requirements, each with its own unit',
      '  and time window. Throughput (orders per day), concurrency (simultaneous',
      '  users), latency (response time) and uptime are four different numbers —',
      '  never merge two into one figure. "10 concurrent orders per day" is not a',
      '  requirement, it is two requirements collapsed into a contradiction, and it',
      '  reaches a client who will read it as carelessness. If the interview gave you',
      '  only one of them, state that one and leave the others out.',
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
    targets: ServiceTargets,
    language: ArtifactLanguage,
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

    // Ids are minted through one counter rather than from array indices, so the
    // sequence stays gapless as sections are added or skipped.
    const nonFunctional: NonFunctionalRequirement[] = [];
    const addNfr = (category: string, description: string): void => {
      nonFunctional.push({
        id: `NFR-${nonFunctional.length + 1}`,
        category,
        description,
      });
    };

    for (const c of summary.constraints) addNfr(inferCategory(c), c);
    // Scale is its own requirement, in the `scalability` category — it is no
    // longer folded into `constraints`, so it would otherwise be dropped from
    // the offline document entirely.
    for (const s of summary.scale ?? []) addNfr('scalability', s);

    // The shared figures, written from the resolved targets rather than restated
    // in this method's own words. These are the sentences the Product Manager's
    // metrics and the architect's compliance table also render, from the same
    // resolution — so the three cannot disagree about a number.
    //
    // Skipped when a constraint above ALREADY states this figure: the constraint
    // is the client's own wording of the same target, and emitting both would
    // print one requirement twice in slightly different words — the duplication
    // this document's own prompt calls its most visible defect.
    const alreadyStated = (parse: (t: string) => number | null, value: number) =>
      summary.constraints.some((c) => parse(c) === value);

    if (targets.latency && !alreadyStated(parseLatencySeconds, targets.latency.value)) {
      addNfr('performance', serviceTargetSentence(targets.latency, language));
    }
    if (targets.uptime && !alreadyStated(parseUptimePercent, targets.uptime.value)) {
      addNfr('availability', serviceTargetSentence(targets.uptime, language));
    }
    // Concurrency is stated separately from the registered-user total, and when
    // it was derived rather than stated the assumption travels with it — the
    // client said how many users they have, not how many are online at once.
    if (targets.concurrentUsers) {
      addNfr(
        'scalability',
        [
          serviceTargetSentence(targets.concurrentUsers, language),
          targets.concurrentUsers.derivation ?? '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    }

    addNfr(
      'security',
      'Sensitive data must be encrypted in transit and at rest; access is role-based.',
    );

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
      assumptionsAndOpenQuestions: withAssumptionKinds(
        deterministicAssumptions(ctx, openQuestions),
      ),
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

/**
 * Everything the client said about WHO uses the system — the provenance source
 * for role names. Deliberately scoped to the roles answer (slot + derived
 * summary + intent), not the whole transcript, so an invented role can't be
 * called sourced merely because its words appear elsewhere in the conversation.
 */
function statedRolesText(ctx: RequirementContext): string {
  return [
    slotText(ctx.slots?.target_users_roles),
    ...ctx.summary.users,
    ...(ctx.intent?.primaryUsers ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

/** The full Q/A transcript as one blob — the source for extraction-gap checks. */
function transcriptText(ctx: RequirementContext): string {
  return ctx.history.map((h) => `${h.question.prompt}\n${h.answer}`).join('\n');
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

/**
 * Phrase one interview open question as an assumed default + its impact.
 *
 * `kind` is set at the source rather than left to `classifyAssumptionKind`,
 * because here it is not a judgement call: these came from the interview's
 * open-question list, which by construction is the set of things the owner could
 * not answer. Nothing a text matcher decides could be more reliable than that.
 */
function openQuestionToAssumption(q: OpenQuestion): RequirementAssumption {
  return {
    assumption: `Assumed a sensible default pending the client's answer: ${q.questionForClient}`,
    impactIfWrong: 'Scope, timeline, or cost may change once the client confirms.',
    kind: 'open_question',
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
      const r = raw as {
        assumption?: unknown;
        impactIfWrong?: unknown;
        kind?: unknown;
      };
      const assumption = typeof r.assumption === 'string' ? r.assumption.trim() : '';
      if (!assumption) return null;
      const impactIfWrong =
        typeof r.impactIfWrong === 'string' ? r.impactIfWrong.trim() : '';
      // An unrecognized `kind` is dropped rather than coerced, so
      // `withAssumptionKinds` classifies it from the text instead of trusting a
      // value the model invented.
      return isAssumptionKind(r.kind)
        ? { assumption, impactIfWrong, kind: r.kind }
        : { assumption, impactIfWrong };
    })
    .filter((x): x is RequirementAssumption => x !== null);
}
