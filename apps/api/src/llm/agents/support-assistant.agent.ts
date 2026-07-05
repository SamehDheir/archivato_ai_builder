import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  type KbArticleRef,
  type SimilarTicketRef,
  type SupportAiAnalysis,
  type SupportAuthorType,
  type SupportCategory,
  type SupportDeflectionResult,
  type SupportPriority,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** Minimal related-project context the AI may use when answering. */
export interface SupportProjectContext {
  title: string;
  summary?: string;
}

/** Input for the pre-ticket deflection layer. */
export interface DeflectionContext {
  message: string;
  project: SupportProjectContext | null;
  /** KB articles the service pre-matched to the query. */
  articles: KbArticleRef[];
  /** The customer's OWN similar past tickets (never other users'). */
  similarTickets: SimilarTicketRef[];
}

/** One conversation turn (already scoped to a single ticket). */
export interface SupportTurn {
  author: SupportAuthorType;
  body: string;
}

/** Input for the in-ticket assistant / admin copilot layers. */
export interface TicketAnalysisContext {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  conversation: SupportTurn[];
  /** Extracted text of any uploaded logs/txt/json attachments. */
  logs: string[];
  project: SupportProjectContext | null;
  /** Admin copilot only: similar tickets across the system. */
  similarTickets: SimilarTicketRef[];
}

/**
 * The AI Support Assistant. One agent fulfils all three layers of the Support
 * Center's AI, each LLM-driven with a **deterministic fallback** so mock mode +
 * tests stay fully offline and every response is always a valid, complete shape:
 *
 *   • deflect()  — pre-ticket: analyze an issue, weave in KB + past tickets,
 *                  and decide whether it's solved or needs a ticket.
 *   • analyze()  — in-ticket: summarize, root-cause, draft a fix + reply.
 *   • copilot()  — admin: analyze() plus urgency, priority, assignment, and
 *                  similar tickets across the system.
 */
@Injectable()
export class SupportAssistantAgent extends BaseAgent {
  readonly role = AgentRole.SupportAssistant;

  private readonly logger = new Logger(SupportAssistantAgent.name);

  protected readonly systemPrompt = [
    'You are a senior Customer Support engineer for "Archivato AI Builder", an',
    'AI SaaS that turns a business idea into a complete software system design',
    '(interview → requirements → system/database/API design → AI review → export).',
    'Be concise, accurate, and empathetic. Prefer solving the issue over',
    'escalating. Use the provided knowledge-base excerpts and similar tickets;',
    'never invent product features or reference other customers’ data.',
    'Always respond with STRICT JSON matching the requested schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  // ── Layer 1: pre-ticket deflection ──────────────────────────────────────

  async deflect(ctx: DeflectionContext): Promise<SupportDeflectionResult> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<SupportDeflectionResult>>(
        this.deflectPrompt(ctx),
      );
      if (this.isDeflection(raw)) {
        return this.normalizeDeflection(raw, ctx, generatedAt);
      }
      this.logger.debug('Deflection malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Deflection failed; using fallback: ${err}`);
    }
    return this.deflectDeterministic(ctx, generatedAt);
  }

  // ── Layer 2 & 3: in-ticket analysis / admin copilot ─────────────────────

  analyze(ctx: TicketAnalysisContext): Promise<SupportAiAnalysis> {
    return this.runAnalysis(ctx, false);
  }

  copilot(ctx: TicketAnalysisContext): Promise<SupportAiAnalysis> {
    return this.runAnalysis(ctx, true);
  }

  private async runAnalysis(
    ctx: TicketAnalysisContext,
    admin: boolean,
  ): Promise<SupportAiAnalysis> {
    const generatedAt = new Date().toISOString();
    try {
      const raw = await this.thinkJson<Partial<SupportAiAnalysis>>(
        this.analysisPrompt(ctx, admin),
      );
      if (this.isAnalysis(raw)) {
        return this.normalizeAnalysis(raw, ctx, admin, generatedAt);
      }
      this.logger.debug('Analysis malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Analysis failed; using fallback: ${err}`);
    }
    return this.analysisDeterministic(ctx, admin, generatedAt);
  }

  // ── Prompts ─────────────────────────────────────────────────────────────

  private deflectPrompt(ctx: DeflectionContext): string {
    return [
      'A user described a problem BEFORE opening a support ticket. Try to solve',
      'it. If the knowledge base or their past tickets resolve it, set solved=true.',
      '',
      `Problem: ${ctx.message}`,
      ctx.project ? `Related project: ${ctx.project.title}` : '',
      ctx.project?.summary ? `Project summary: ${ctx.project.summary}` : '',
      this.articlesBlock(ctx.articles),
      this.similarBlock(ctx.similarTickets),
      '',
      'Return JSON: { "answer": string, "solved": boolean, "confidence": number',
      '(0..1), "suggestedCategory": one of ' + this.list(SUPPORT_CATEGORIES) + ',',
      '"suggestedPriority": one of ' + this.list(SUPPORT_PRIORITIES) + ',',
      '"quickFixes": string[] }.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private analysisPrompt(ctx: TicketAnalysisContext, admin: boolean): string {
    const lines = [
      admin
        ? 'You are assisting a support ADMIN. Analyze this ticket end to end.'
        : 'Analyze this support ticket to help resolve it.',
      '',
      `Subject: ${ctx.subject}`,
      `Category: ${ctx.category} · Priority: ${ctx.priority}`,
      ctx.project ? `Related project: ${ctx.project.title}` : '',
      '',
      'Conversation:',
      ...ctx.conversation.map((t) => `- [${t.author}] ${t.body}`),
    ];
    if (ctx.logs.length) {
      lines.push('', 'Uploaded logs:', ...ctx.logs.map((l) => truncate(l, 1500)));
    }
    if (admin && ctx.similarTickets.length) {
      lines.push('', this.similarBlock(ctx.similarTickets));
    }
    lines.push(
      '',
      'Return JSON: { "summary": string, "rootCause": string,',
      '"suggestedFix": string, "suggestedReply": string,',
      '"suggestedCategory": one of ' + this.list(SUPPORT_CATEGORIES) + ',',
      '"suggestedPriority": one of ' + this.list(SUPPORT_PRIORITIES) + ',',
      '"confidence": number (0..1)' +
        (admin ? ', "suggestedAssignment": string' : '') +
        ' }.',
    );
    return lines.filter(Boolean).join('\n');
  }

  private articlesBlock(articles: KbArticleRef[]): string {
    if (!articles.length) return '';
    return [
      'Knowledge base matches:',
      ...articles.map((a) => `- ${a.title}: ${a.excerpt}`),
    ].join('\n');
  }

  private similarBlock(tickets: SimilarTicketRef[]): string {
    if (!tickets.length) return '';
    return [
      'Similar tickets:',
      ...tickets.map((t) => `- #${t.number} (${t.status}): ${t.subject}`),
    ].join('\n');
  }

  private list(values: readonly string[]): string {
    return values.join(' | ');
  }

  // ── Validation + normalization ──────────────────────────────────────────

  private isDeflection(v: Partial<SupportDeflectionResult> | null): boolean {
    return !!v && typeof v.answer === 'string' && v.answer.length > 0;
  }

  private isAnalysis(v: Partial<SupportAiAnalysis> | null): boolean {
    return (
      !!v &&
      typeof v.summary === 'string' &&
      typeof v.rootCause === 'string' &&
      typeof v.suggestedReply === 'string'
    );
  }

  private normalizeDeflection(
    raw: Partial<SupportDeflectionResult>,
    ctx: DeflectionContext,
    generatedAt: string,
  ): SupportDeflectionResult {
    return {
      answer: raw.answer!,
      solved: raw.solved ?? ctx.articles.length > 0,
      confidence: clamp01(raw.confidence ?? 0.5),
      suggestedCategory: this.category(raw.suggestedCategory, ctx.message),
      suggestedPriority: this.priority(raw.suggestedPriority, ctx.message),
      articles: ctx.articles,
      similarTickets: ctx.similarTickets,
      quickFixes: Array.isArray(raw.quickFixes)
        ? raw.quickFixes.filter((s) => typeof s === 'string').slice(0, 5)
        : this.quickFixes(ctx.message),
      generatedAt,
    };
  }

  private normalizeAnalysis(
    raw: Partial<SupportAiAnalysis>,
    ctx: TicketAnalysisContext,
    admin: boolean,
    generatedAt: string,
  ): SupportAiAnalysis {
    return {
      summary: raw.summary!,
      rootCause: raw.rootCause!,
      suggestedFix: raw.suggestedFix || this.fixFromKeywords(ctx),
      suggestedReply: raw.suggestedReply!,
      suggestedCategory: this.category(raw.suggestedCategory, this.blob(ctx)) ,
      suggestedPriority: this.priority(raw.suggestedPriority, this.blob(ctx)),
      suggestedAssignment: admin
        ? raw.suggestedAssignment ?? this.assignment(ctx)
        : null,
      similarTickets: admin ? ctx.similarTickets : [],
      confidence: clamp01(raw.confidence ?? 0.5),
      generatedAt,
    };
  }

  // ── Deterministic fallbacks ─────────────────────────────────────────────

  private deflectDeterministic(
    ctx: DeflectionContext,
    generatedAt: string,
  ): SupportDeflectionResult {
    const hasAnswer = ctx.articles.length > 0;
    const answer = hasAnswer
      ? `Here's what should help: ${ctx.articles[0].title}. ${ctx.articles[0].excerpt}` +
        (ctx.articles.length > 1
          ? ` You may also find "${ctx.articles[1].title}" useful.`
          : '')
      : "I couldn't find an existing article that solves this. If the quick fixes below don't help, open a ticket and our team will assist you.";
    return {
      answer,
      solved: hasAnswer,
      confidence: hasAnswer ? 0.6 : 0.25,
      suggestedCategory: this.category(undefined, ctx.message),
      suggestedPriority: this.priority(undefined, ctx.message),
      articles: ctx.articles,
      similarTickets: ctx.similarTickets,
      quickFixes: this.quickFixes(ctx.message),
      generatedAt,
    };
  }

  private analysisDeterministic(
    ctx: TicketAnalysisContext,
    admin: boolean,
    generatedAt: string,
  ): SupportAiAnalysis {
    const customerTurns = ctx.conversation.filter(
      (t) => t.author === 'customer',
    );
    const firstMsg = customerTurns[0]?.body ?? ctx.subject;
    const summary =
      `Customer reported: ${truncate(firstMsg, 220)}` +
      (ctx.conversation.length > 1
        ? ` The thread has ${ctx.conversation.length} messages.`
        : '');
    const rootCause = ctx.logs.length
      ? `Likely tied to the uploaded log(s): ${this.logSignal(ctx.logs)}.`
      : `Based on the description, this appears to be a ${label(ctx.category)} issue. ${this.rootCauseHint(this.blob(ctx))}`;

    return {
      summary,
      rootCause,
      suggestedFix: this.fixFromKeywords(ctx),
      suggestedReply: this.replyDraft(ctx, firstMsg),
      suggestedCategory: this.category(undefined, this.blob(ctx)),
      suggestedPriority: this.priority(ctx.priority, this.blob(ctx)),
      suggestedAssignment: admin ? this.assignment(ctx) : null,
      similarTickets: admin ? ctx.similarTickets : [],
      confidence: ctx.logs.length ? 0.5 : 0.4,
      generatedAt,
    };
  }

  // ── Heuristics ──────────────────────────────────────────────────────────

  private blob(ctx: TicketAnalysisContext): string {
    return `${ctx.subject} ${ctx.conversation.map((t) => t.body).join(' ')} ${ctx.logs.join(' ')}`;
  }

  private category(
    given: SupportCategory | undefined,
    text: string,
  ): SupportCategory {
    if (given && (SUPPORT_CATEGORIES as string[]).includes(given)) return given;
    const t = text.toLowerCase();
    if (/(bill|payment|invoice|charge|refund|upgrade|pro|plan|quota)/.test(t))
      return 'billing';
    if (/(login|sign in|password|account|verify|email|oauth)/.test(t))
      return 'account';
    if (/(api|endpoint|openapi|swagger|request|response|401|402|409|500)/.test(t))
      return 'api';
    if (/(generat|interview|design|review|roadmap|llm|groq|model|ai)/.test(t))
      return 'ai_generation';
    if (/(crash|error|bug|broken|exception|stack ?trace|fail)/.test(t))
      return 'bug';
    if (/(feature|request|add|support for|would be nice|wish)/.test(t))
      return 'feature_request';
    if (/(security|vulnerab|leak|xss|csrf|breach|token|exposed)/.test(t))
      return 'security';
    if (/(slow|timeout|performance|error|not working|stuck)/.test(t))
      return 'technical';
    return 'general';
  }

  private priority(
    given: SupportPriority | undefined,
    text: string,
  ): SupportPriority {
    if (given && (SUPPORT_PRIORITIES as string[]).includes(given)) return given;
    const t = text.toLowerCase();
    if (/(security|breach|data loss|leak|urgent|critical|down|cannot access|exposed|production)/.test(t))
      return 'critical';
    if (/(blocked|can'?t|cannot|broken|error|fail|charged twice|not working)/.test(t))
      return 'high';
    if (/(question|how do i|clarif|feature|request|nice to have)/.test(t))
      return 'low';
    return 'medium';
  }

  private quickFixes(message: string): string[] {
    const t = message.toLowerCase();
    const fixes: string[] = [];
    if (/(login|password|sign in|401)/.test(t))
      fixes.push('Sign out and back in, then try "Forgot password?" if it persists.');
    if (/(generat|stuck|ai|groq|model)/.test(t))
      fixes.push('Ensure Redis is running and retry — every stage has a deterministic fallback.');
    if (/(pro|upgrade|locked|402|billing|quota)/.test(t))
      fixes.push('Open the upgrade modal from the locked tab or the quota banner.');
    if (/(export|download|pdf|openapi)/.test(t))
      fixes.push('Use the Export tab on a confirmed project (or "Print / Save as PDF").');
    if (!fixes.length)
      fixes.push('Refresh the page and retry.', 'Check the browser console / API logs for a specific error.');
    return fixes.slice(0, 4);
  }

  private rootCauseHint(text: string): string {
    const t = text.toLowerCase();
    if (/(401|unauthor|session|expired)/.test(t))
      return 'Most often an expired session/token.';
    if (/(402|pro|upgrade|locked)/.test(t))
      return 'The feature is gated behind the Pro plan.';
    if (/(409|prerequisite|before|generate first)/.test(t))
      return 'An upstream pipeline stage has not been generated yet.';
    return 'The exact cause needs the reproduction steps from the customer.';
  }

  private fixFromKeywords(ctx: TicketAnalysisContext): string {
    const fixes = this.quickFixes(this.blob(ctx));
    return fixes[0] ?? 'Reproduce the issue and confirm the environment (browser, plan, and whether Redis/DB are running).';
  }

  private logSignal(logs: string[]): string {
    const joined = logs.join('\n');
    const m = joined.match(/(error|exception|failed|timeout|refused|denied)[^\n]{0,80}/i);
    return m ? truncate(m[0], 120) : 'no explicit error line found — review the full trace';
  }

  private replyDraft(ctx: TicketAnalysisContext, firstMsg: string): string {
    return [
      'Hi, thanks for reaching out — sorry for the trouble.',
      `I understand you're seeing an issue with ${truncate(firstMsg, 120)}.`,
      `This looks like a ${label(ctx.category)} matter. ${this.fixFromKeywords(ctx)}`,
      'Could you confirm the steps to reproduce and your browser/plan so we can dig in? Thanks!',
    ].join(' ');
  }

  private assignment(ctx: TicketAnalysisContext): string {
    const cat = this.category(undefined, this.blob(ctx));
    const map: Record<SupportCategory, string> = {
      technical: 'Platform/Infra team',
      billing: 'Billing team',
      ai_generation: 'AI/Pipeline team',
      api: 'API/Backend team',
      bug: 'Engineering (triage)',
      feature_request: 'Product team',
      account: 'Accounts/Trust team',
      security: 'Security team (escalate)',
      general: 'Frontline support',
    };
    return map[cat];
  }
}

// ── module-local helpers ──────────────────────────────────────────────────

function clamp01(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function label(category: SupportCategory): string {
  return category.replace(/_/g, ' ');
}
