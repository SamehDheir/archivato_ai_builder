import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  copyFor,
  MARKET_HONESTY_RULES,
  normalizeBusinessAnalysis,
  normalizeMvpAssessment,
  screenUngroundedSpecifics,
  stripMetrics,
  withResearchChecklist,
  type ArtifactLanguage,
  type LocalizedCopy,
  type BusinessAnalysis,
  type IntentAnalysis,
  type RequirementsSummary,
  type SlotKey,
  type SlotMap,
  type UserSegment,
  untrustedField,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';
import { splitSlotList } from '../../interview/slots';

/** What the Business Analyst needs from the confirmed interview. */
export interface BusinessAnalysisContext {
  idea: string;
  industry?: string;
  intent: IntentAnalysis | null;
  summary: RequirementsSummary;
  /** The slot snapshot (R6). Possibly absent on plan-mode runs — tolerated. */
  slots?: SlotMap;
}

/**
 * Owns the Business Analysis stage: the discovery pass that runs between the
 * confirmed interview and the Requirement Document, so the pipeline reasons
 * about the business case before it starts specifying software.
 *
 * **This is the one agent asked for things the interview cannot supply.**
 * Competitors and market conditions are outside knowledge and there is no web
 * access here, so the whole design is built to stop a guess from reading as a
 * fact: `MARKET_HONESTY_RULES` is embedded verbatim in the system prompt (and
 * pinned by a test), every outside claim carries a confidence, there is no
 * market-size field to fabricate a number into, and the artifact ships a
 * research checklist naming what the owner must verify.
 *
 * The deterministic fallback goes further and emits **no competitors at all** —
 * offline, the code knows the interview and nothing else, and an invented
 * competitor list is worse than an empty one with an honest note.
 */
@Injectable()
export class BusinessAnalystAgent extends BaseAgent {
  readonly role = AgentRole.BusinessAnalyst;

  protected readonly systemPrompt = [
    'You are a pragmatic Business Analyst working for a software house that is',
    'scoping a client project. The client has already decided to build this — your',
    'job is not to talk them out of it, it is to make sure the team understands the',
    'business before anyone writes a requirement, and to surface commercial risk',
    'the owner should raise with their client early rather than discover late.',
    'Method: state the problem in the client\'s own vocabulary, identify the',
    'distinct user segments and the job each hires the product to do, articulate',
    'why a buyer would choose this over what they use today, and judge whether the',
    'proposed first release is the right cut — too large is the common failure, and',
    'too thin is real too.',
    MARKET_HONESTY_RULES,
    'Verdict: "proceed" when the problem is clear and the MVP is sensible;',
    '"proceed-with-changes" when scope or positioning needs a fix first;',
    '"needs-validation" when the core assumption should be tested with real users;',
    '"high-risk" when there is commercial risk the owner must raise with the client.',
    'Output standard: every statement traces to something the interview actually',
    'established, or is marked unverified. Be specific to THIS business — generic',
    'startup advice is worthless here. Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async generate(
    sessionId: string,
    ctx: BusinessAnalysisContext,
  ): Promise<BusinessAnalysis> {
    const generatedAt = new Date().toISOString();
    return this.generateArtifact<BusinessAnalysis>({
      label: 'Business analysis',
      prompt: this.buildPrompt(ctx),
      isValid: (raw) => this.isValid(raw),
      accept: (raw, language) =>
        this.normalize(sessionId, generatedAt, raw, ctx, language),
      fallback: (language) =>
        this.buildDeterministic(sessionId, generatedAt, ctx, language),
      // Explicit temperature 0, even though `completeJson` already defaults to it
      // on every provider — this is the one artifact whose sections are meant to
      // be researched facts, not creative writing, so the intent is stated here
      // rather than left to a provider default that a later change could raise.
      // (The residual run-to-run drift at 0 is handled structurally by pinning the
      // facts across re-runs in the service, not by chasing determinism here.)
      options: { temperature: 0 },
    });
  }

  /**
   * SEARCH-GROUNDING SEAM (deliberately empty).
   *
   * The right fix for ungrounded competitor/market/regulatory claims is to
   * research them against a real source before writing. That needs a capability
   * this platform does not have yet — the `LlmProvider` seam exposes only
   * `complete`/`completeJson`, with no tool-use or web-search — so it is a slice
   * of its own (a `ResearchProvider` abstraction + a search-then-summarise flow),
   * not a prompt tweak. Until it exists, this agent MUST NOT present a named
   * specific it cannot ground: the prompt forbids it (`MARKET_HONESTY_RULES`) and
   * `screenUngroundedSpecifics` enforces it in code. When search lands, its
   * findings get injected into `buildPrompt` here and become the grounding text
   * `screenUngroundedSpecifics` already checks against — the enforcement does not
   * change, only what counts as grounded widens from "the interview" to "the
   * interview plus verified search results".
   */
  private buildPrompt(ctx: BusinessAnalysisContext): string {
    const s = ctx.slots;
    return [
      untrustedField('Idea', ctx.idea),
      ctx.industry ? `Industry: ${ctx.industry}` : '',
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      ctx.intent ? `Primary users: ${ctx.intent.primaryUsers.join(', ')}` : '',
      '',
      'What the client told us (may be partial — tolerate gaps):',
      `- Business domain: ${slotText(s, 'business_domain') || 'not stated'}`,
      `- Users / roles: ${slotText(s, 'target_users_roles') || 'not stated'}`,
      `- Target market: ${slotText(s, 'target_market') || 'not stated'}`,
      `- Core workflows: ${slotText(s, 'core_workflows') || 'not stated'}`,
      `- Integrations: ${slotText(s, 'integrations') || 'not stated'}`,
      `- Existing assets: ${slotText(s, 'existing_assets') || 'none stated'}`,
      `- Expected scale: ${slotText(s, 'scale_expectations') || 'not stated'}`,
      `- Hard constraints: ${slotText(s, 'constraints') || 'none stated'}`,
      '',
      `Goal in their words: ${ctx.summary.goal || 'not stated'}`,
      `Features they asked for: ${ctx.summary.features.join('; ') || 'not stated'}`,
      '',
      'Return JSON with these keys:',
      '- problem: {problem, whoHasIt, currentAlternative, costOfInaction}.',
      '- segments[]: {name, description, jobToBeDone, painPoints[]}.',
      '- competitors[]: {name, category, positioning, strengths[], weaknesses[], confidence}',
      '  — real products you genuinely recall in this category, NO business metrics.',
      '  An empty array with a researchChecklist entry is correct if you recall none.',
      '- market: {demandSignals[], headwinds[], sizeNote, confidence} — sizeNote is',
      '  qualitative (crowded / fragmented / nascent / local); NEVER a dollar figure.',
      '- usp: {statement, differentiators[], defensibility} — defensibility may',
      '  honestly say a competitor could copy it.',
      '- mvp: {verdict (well-scoped|too-large|too-thin), reasoning, recommendedCore[], deferSuggestions[]}.',
      '- verdict: proceed | proceed-with-changes | needs-validation | high-risk.',
      '- verdictRationale: 2-3 sentences the owner could say to their client.',
      '- researchChecklist[]: every unverified claim above, as a thing to check.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private isValid(value: Partial<BusinessAnalysis> | null): boolean {
    return (
      !!value &&
      !!value.problem &&
      typeof value.problem.problem === 'string' &&
      Array.isArray(value.segments) &&
      value.segments.length > 0 &&
      !!value.usp &&
      typeof value.usp.statement === 'string'
    );
  }

  /**
   * Trust a conforming analysis but guarantee the honesty invariants hold, since
   * they are the whole reason this stage is safe to ship: confidences are
   * sanitized (anything unrecognized reads `unverified`), no competitor keeps a
   * fabricated metric, and the research checklist is never empty while an
   * unverified claim exists.
   */
  private normalize(
    sessionId: string,
    generatedAt: string,
    raw: Partial<BusinessAnalysis>,
    ctx: BusinessAnalysisContext,
    language: ArtifactLanguage,
  ): BusinessAnalysis {
    // Shape first (arrays coerced, confidences sanitized, checklist backfilled),
    // then strip any banned metric the prompt failed to prevent. Order matters:
    // `stripMetrics` needs the competitor strings to exist as strings.
    const shaped = normalizeBusinessAnalysis({
      ...(raw as BusinessAnalysis),
      sessionId,
      generatedAt,
      // Stamped BEFORE normalizing, because `normalizeBusinessAnalysis` composes
      // the research checklist and reads the language off the artifact it is
      // given. Stamping afterwards would build an English checklist and then
      // label the document Arabic.
      language,
      mvp: {
        ...normalizeMvpAssessment(raw.mvp, language),
        // The interview's own feature list is a better default core than an
        // empty one — the model omitting it says nothing about the features.
        recommendedCore: raw.mvp?.recommendedCore ?? ctx.summary.features.slice(0, 5),
      },
    });

    const metricsStripped: BusinessAnalysis = {
      ...shaped,
      competitors: shaped.competitors.map((c) => ({
        ...c,
        positioning: stripMetrics(c.positioning, language),
        strengths: c.strengths.map((v) => stripMetrics(v, language)),
        weaknesses: c.weaknesses.map((v) => stripMetrics(v, language)),
      })),
      market: {
        ...shaped.market,
        sizeNote: stripMetrics(shaped.market.sizeNote, language),
      },
    };

    // Second backstop: generalize any named law/regulator/initiative the model
    // could not have grounded. `stripMetrics` removes invented NUMBERS; this
    // removes invented NAMED SPECIFICS — the class the "unverified" badge was
    // quietly licensing. Grounded against the interview: a regime the client
    // actually stated survives; one the model supplied is generalized and pushed
    // to the research checklist.
    return screenUngroundedSpecifics(metricsStripped, this.groundingText(ctx));
  }

  /**
   * Everything the client actually said, as one lowercase-searchable string.
   *
   * This is the allowlist a named specific must appear in to survive
   * `screenUngroundedSpecifics` — the model's own inventions are not in it, the
   * client's stated facts are. When the search seam above lands, verified results
   * are appended here and the enforcement is unchanged.
   */
  private groundingText(ctx: BusinessAnalysisContext): string {
    const slotValues = ctx.slots
      ? Object.values(ctx.slots)
          .map((v) => (typeof v?.value === 'string' ? v.value : ''))
          .join(' ')
      : '';
    return [
      ctx.idea,
      ctx.industry ?? '',
      ctx.intent?.domain ?? '',
      ctx.summary.goal ?? '',
      ctx.summary.features.join(' '),
      slotValues,
    ].join(' ');
  }

  // ── deterministic fallback ────────────────────────────────────────────────

  /**
   * Offline, the code knows the interview and nothing else.
   *
   * So it states the problem and segments from the slots — which it can do
   * honestly — and emits **no competitors and no market judgment**, because
   * those require knowledge it does not have. Every other agent's fallback
   * approximates the model; this one deliberately refuses to, on exactly the
   * fields where an approximation would be a fabrication.
   */
  private buildDeterministic(
    sessionId: string,
    generatedAt: string,
    ctx: BusinessAnalysisContext,
    language: ArtifactLanguage,
  ): BusinessAnalysis {
    const s = ctx.slots;
    const copy = copyFor(FALLBACK_COPY, language);
    const domain = slotText(s, 'business_domain') || ctx.industry || ctx.idea;
    const roles = splitSlotList(slotText(s, 'target_users_roles')).slice(0, 4);
    const workflows = splitSlotList(slotText(s, 'core_workflows'));

    const segments: UserSegment[] = (roles.length ? roles : [copy.primaryUser]).map(
      (name) => ({
        name,
        description: copy.segmentDescription(name, domain),
        jobToBeDone: workflows[0] ?? ctx.summary.goal ?? copy.genericJob,
        painPoints: [copy.painFromInterview],
      }),
    );

    return withResearchChecklist({
      sessionId,
      generatedAt,
      // Stamped here too, and it is load-bearing rather than decorative:
      // `withResearchChecklist` below composes its sentences in the language it
      // reads off this object. An unstamped fallback would build an English
      // checklist into a document whose every other line is Arabic.
      language,
      problem: {
        problem: ctx.summary.goal || copy.operateWithoutManual(domain),
        whoHasIt: roles.join(copy.listSeparator) || copy.theClientsUsers,
        currentAlternative: slotText(s, 'existing_assets') || copy.notStated,
        costOfInaction: copy.notStatedWorthAsking,
      },
      segments,
      // Deliberately empty: an offline run has no basis for naming a competitor.
      competitors: [],
      market: {
        demandSignals: [],
        headwinds: [],
        sizeNote: copy.notAssessedNoProvider,
        confidence: 'unverified',
      },
      usp: {
        statement: copy.uspStatement(
          domain,
          workflows.slice(0, 2).join('; ') || ctx.summary.goal || copy.coreWorkflow,
        ),
        differentiators: workflows.slice(0, 3),
        defensibility: copy.defensibilityNotAssessed,
      },
      mvp: {
        verdict: 'well-scoped',
        reasoning: copy.mvpNotAssessedOffline,
        recommendedCore: ctx.summary.features.slice(0, 5),
        deferSuggestions: ctx.summary.features.slice(5),
      },
      verdict: 'needs-validation',
      verdictRationale: copy.verdictRationaleOffline,
      researchChecklist: [],
    });
  }
}

/**
 * The prose this agent composes when there is no model to write it.
 *
 * An offline fallback is the case where localization is easiest to forget and
 * most damaging to skip: it fires exactly when generation has already degraded,
 * so an English-only fallback drops an English section into an otherwise Arabic
 * package and the owner sees the half-translated document they were promised was
 * fixed. `LocalizedCopy` makes a missing language a compile error, so a locale
 * added later cannot ship with this file quietly still in English.
 *
 * Note what is NOT translated: the slot values interpolated into these sentences
 * (`domain`, role names, workflows) are the **client's own words**, and those are
 * already in whatever language they typed them in. The code composes around them;
 * it never rewrites them.
 */
const FALLBACK_COPY: LocalizedCopy<{
  primaryUser: string;
  segmentDescription: (role: string, domain: string) => string;
  genericJob: string;
  painFromInterview: string;
  operateWithoutManual: (domain: string) => string;
  theClientsUsers: string;
  listSeparator: string;
  notStated: string;
  notStatedWorthAsking: string;
  notAssessedNoProvider: string;
  uspStatement: (domain: string, around: string) => string;
  coreWorkflow: string;
  defensibilityNotAssessed: string;
  mvpNotAssessedOffline: string;
  verdictRationaleOffline: string;
}> = {
  en: {
    primaryUser: 'Primary user',
    segmentDescription: (role, domain) => `A ${role.toLowerCase()} in ${domain}.`,
    genericJob: 'Use the product to get their work done.',
    painFromInterview: 'Recorded in the interview — confirm with the client.',
    operateWithoutManual: (domain) =>
      `Operate ${domain} without the current manual process.`,
    theClientsUsers: 'The client’s users',
    listSeparator: ', ',
    notStated: 'Not stated in the interview.',
    notStatedWorthAsking: 'Not stated in the interview — worth asking the client.',
    notAssessedNoProvider:
      'Not assessed — this analysis was generated without an AI provider.',
    uspStatement: (domain, around) =>
      `A ${domain} product built around: ${around}.`,
    coreWorkflow: 'the client’s core workflow',
    defensibilityNotAssessed:
      'Not assessed — confirm what makes this hard to copy.',
    mvpNotAssessedOffline:
      'Not assessed offline; the feature list was taken as stated.',
    verdictRationaleOffline:
      'This analysis was generated without an AI provider, so the market and ' +
      'competitive sections were not assessed. Re-run it with a provider configured.',
  },
  ar: {
    primaryUser: 'المستخدم الأساسي',
    segmentDescription: (role, domain) => `${role} في مجال ${domain}.`,
    genericJob: 'استخدام المنتج لإنجاز عمله.',
    painFromInterview: 'مسجَّل في المقابلة — يُرجى التأكيد مع العميل.',
    operateWithoutManual: (domain) =>
      `إدارة ${domain} دون الاعتماد على العملية اليدوية الحالية.`,
    theClientsUsers: 'مستخدمو العميل',
    // Arabic lists are separated by the Arabic comma (U+060C), not the Latin one.
    // A Latin comma in Arabic text renders with the wrong shape and, in a
    // right-to-left run, sits on the wrong side of the word it follows.
    listSeparator: '، ',
    notStated: 'غير مذكور في المقابلة.',
    notStatedWorthAsking: 'غير مذكور في المقابلة — يُستحسن سؤال العميل عنه.',
    notAssessedNoProvider:
      'لم يُقيَّم — أُنشئ هذا التحليل دون الاتصال بمزوّد ذكاء اصطناعي.',
    uspStatement: (domain, around) =>
      `منتج في مجال ${domain} مبني حول: ${around}.`,
    coreWorkflow: 'سير العمل الأساسي لدى العميل',
    defensibilityNotAssessed:
      'لم تُقيَّم — يُرجى تحديد ما يجعل هذا المنتج صعب التقليد.',
    mvpNotAssessedOffline:
      'لم يُقيَّم دون اتصال؛ اعتُمدت قائمة الميزات كما وردت.',
    verdictRationaleOffline:
      'أُنشئ هذا التحليل دون الاتصال بمزوّد ذكاء اصطناعي، لذلك لم تُقيَّم أقسام ' +
      'السوق والمنافسة. أعد تشغيله بعد ضبط مزوّد.',
  },
};

function slotText(slots: SlotMap | undefined, key: SlotKey): string {
  const value = slots?.[key];
  return typeof value?.value === 'string' ? value.value : '';
}
