import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  MARKET_HONESTY_RULES,
  normalizeBusinessAnalysis,
  normalizeMvpAssessment,
  stripMetrics,
  withResearchChecklist,
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
      accept: (raw) => this.normalize(sessionId, generatedAt, raw, ctx),
      fallback: () => this.buildDeterministic(sessionId, generatedAt, ctx),
    });
  }

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
  ): BusinessAnalysis {
    // Shape first (arrays coerced, confidences sanitized, checklist backfilled),
    // then strip any banned metric the prompt failed to prevent. Order matters:
    // `stripMetrics` needs the competitor strings to exist as strings.
    const shaped = normalizeBusinessAnalysis({
      ...(raw as BusinessAnalysis),
      sessionId,
      generatedAt,
      mvp: {
        ...normalizeMvpAssessment(raw.mvp),
        // The interview's own feature list is a better default core than an
        // empty one — the model omitting it says nothing about the features.
        recommendedCore: raw.mvp?.recommendedCore ?? ctx.summary.features.slice(0, 5),
      },
    });

    return {
      ...shaped,
      competitors: shaped.competitors.map((c) => ({
        ...c,
        positioning: stripMetrics(c.positioning),
        strengths: c.strengths.map(stripMetrics),
        weaknesses: c.weaknesses.map(stripMetrics),
      })),
      market: { ...shaped.market, sizeNote: stripMetrics(shaped.market.sizeNote) },
    };
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
  ): BusinessAnalysis {
    const s = ctx.slots;
    const domain = slotText(s, 'business_domain') || ctx.industry || ctx.idea;
    const roles = splitSlotList(slotText(s, 'target_users_roles')).slice(0, 4);
    const workflows = splitSlotList(slotText(s, 'core_workflows'));

    const segments: UserSegment[] = (roles.length ? roles : ['Primary user']).map(
      (name) => ({
        name,
        description: `A ${name.toLowerCase()} in ${domain}.`,
        jobToBeDone: workflows[0] ?? ctx.summary.goal ?? 'Use the product to get their work done.',
        painPoints: ['Recorded in the interview — confirm with the client.'],
      }),
    );

    return withResearchChecklist({
      sessionId,
      generatedAt,
      problem: {
        problem: ctx.summary.goal || `Operate ${domain} without the current manual process.`,
        whoHasIt: roles.join(', ') || 'The client’s users',
        currentAlternative: slotText(s, 'existing_assets') || 'Not stated in the interview.',
        costOfInaction: 'Not stated in the interview — worth asking the client.',
      },
      segments,
      // Deliberately empty: an offline run has no basis for naming a competitor.
      competitors: [],
      market: {
        demandSignals: [],
        headwinds: [],
        sizeNote: 'Not assessed — this analysis was generated without an AI provider.',
        confidence: 'unverified',
      },
      usp: {
        statement: `A ${domain} product built around: ${workflows.slice(0, 2).join('; ') || ctx.summary.goal || 'the client’s core workflow'}.`,
        differentiators: workflows.slice(0, 3),
        defensibility: 'Not assessed — confirm what makes this hard to copy.',
      },
      mvp: {
        verdict: 'well-scoped',
        reasoning: 'Not assessed offline; the feature list was taken as stated.',
        recommendedCore: ctx.summary.features.slice(0, 5),
        deferSuggestions: ctx.summary.features.slice(5),
      },
      verdict: 'needs-validation',
      verdictRationale:
        'This analysis was generated without an AI provider, so the market and ' +
        'competitive sections were not assessed. Re-run it with a provider configured.',
      researchChecklist: [],
    });
  }
}

function slotText(slots: SlotMap | undefined, key: SlotKey): string {
  const value = slots?.[key];
  return typeof value?.value === 'string' ? value.value : '';
}
