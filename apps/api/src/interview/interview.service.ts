import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  COMPLETENESS_THRESHOLD,
  INTERVIEW_MAX_QUESTIONS,
  INTERVIEW_PHASE_ORDER,
  InterviewPhase,
  type InterviewExchange,
  type InterviewQuestion,
  type InterviewState,
  type IntentAnalysis,
  type ProjectIdeaInput,
  type ProjectSummary,
  type RequirementsSummary,
} from '@archivato/shared';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from './interview-session.repository';
import type { InterviewSession } from './interview-session.entity';
import { BillingService } from '../billing/billing.service';
import { QUESTION_PLAN, TOTAL_QUESTIONS } from './question-plan';
import { detectLanguage } from './language';

/**
 * Adaptive interview caps so a real model can't end too early or run forever.
 * Keep the interview short — never more than 9 questions total (fewer is fine).
 */
const MIN_ADAPTIVE_QUESTIONS = 3;
const MAX_ADAPTIVE_QUESTIONS = INTERVIEW_MAX_QUESTIONS;

/** One turn's decision: the next question (or done) plus a coverage estimate. */
interface InterviewDecision {
  done: boolean;
  coverage: number;
  question: InterviewQuestion | null;
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly repo: InterviewSessionRepository,
    private readonly productAnalyst: ProductAnalystAgent,
    private readonly interviewer: InterviewerAgent,
    private readonly billing: BillingService,
  ) {}

  /**
   * Start a new interview from a raw idea and return the first question. The
   * session is stamped with the owner so only they can read or advance it later
   * (`userId` is null only in unit tests, which exercise the state machine
   * directly without the auth layer).
   */
  async start(
    input: ProjectIdeaInput,
    userId: string | null = null,
  ): Promise<InterviewState> {
    // Enforce the plan's project-count quota (Free = 1, Pro = 5): a user at
    // their limit must delete a project or upgrade before starting another.
    // Skipped for owner-less sessions (unit tests drive the state machine).
    if (userId) {
      const [count, quota] = await Promise.all([
        this.repo.countByUserId(userId),
        this.billing.getProjectQuota(userId),
      ]);
      if (count >= quota) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'Payment Required',
            code: 'quota_exceeded',
            message:
              quota === 1
                ? 'Your Free plan allows 1 project. Delete it or upgrade to Pro (5 projects) to start another.'
                : `You've reached your plan limit of ${quota} projects. Delete one or upgrade to start another.`,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
    const now = new Date();
    const session: InterviewSession = {
      id: randomUUID(),
      userId,
      input,
      title: null,
      status: 'collecting',
      intent: await this.analyzeIntent(input),
      history: [],
      pendingQuestion: null,
      coverage: 0,
      summary: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.advance(session); // choose the first question
    await this.repo.create(session);
    return this.toState(session);
  }

  /** Record an answer to the current question and advance the loop. */
  async answer(sessionId: string, answer: string): Promise<InterviewState> {
    const session = await this.require(sessionId);

    if (session.status !== 'collecting') {
      throw new ConflictException(
        `Session is "${session.status}"; no question is awaiting an answer.`,
      );
    }

    const question = session.pendingQuestion;
    if (!question) {
      // Shouldn't happen while collecting, but guard anyway.
      throw new ConflictException('No question is currently pending.');
    }

    session.history.push({ question, answer: answer.trim() });
    await this.advance(session);

    await this.repo.save(session);
    return this.toState(session);
  }

  /** Confirm the summarized requirements, locking the interview. */
  async confirm(sessionId: string): Promise<InterviewState> {
    const session = await this.require(sessionId);

    if (session.status !== 'awaiting_confirmation') {
      throw new ConflictException(
        `Cannot confirm a session in status "${session.status}".`,
      );
    }

    session.status = 'confirmed';
    await this.repo.save(session);
    return this.toState(session);
  }

  /** Delete a project (owner-guarded at the controller); cascades its artifacts. */
  async deleteProject(sessionId: string): Promise<void> {
    await this.require(sessionId); // 404 if it doesn't exist
    await this.repo.delete(sessionId);
  }

  /**
   * Set (or clear) a project's display name (owner-guarded at the controller).
   * An empty/blank title clears it, so the UI falls back to the idea. Doesn't
   * touch the idea — that stays the AI's source of truth.
   */
  async rename(sessionId: string, title: string): Promise<ProjectSummary> {
    const session = await this.require(sessionId);
    const trimmed = title.trim();
    session.title = trimmed.length ? trimmed : null;
    await this.repo.save(session);
    return this.toSummary(session);
  }

  async getState(sessionId: string): Promise<InterviewState> {
    return this.toState(await this.require(sessionId));
  }

  /** List the projects owned by a user, most recently updated first. */
  async list(userId: string): Promise<ProjectSummary[]> {
    const sessions = await this.repo.findByUserId(userId);
    return sessions.map((s) => this.toSummary(s));
  }

  // ── internals ─────────────────────────────────────────────────────────

  /** Map a session to its lightweight "my projects" row. */
  private toSummary(s: InterviewSession): ProjectSummary {
    return {
      sessionId: s.id,
      idea: s.input.idea,
      title: s.title ?? undefined,
      status: s.status,
      completeness: round2(s.coverage),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private async require(sessionId: string): Promise<InterviewSession> {
    const session = await this.repo.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    return session;
  }

  /**
   * Runs the Product Analyst agent, but tolerates a non-conforming provider
   * (e.g. the default mock echo) by falling back to a deterministic analysis so
   * the flow always has a sensible intent to show.
   */
  private async analyzeIntent(
    input: ProjectIdeaInput,
  ): Promise<IntentAnalysis> {
    try {
      const result = await this.productAnalyst.analyze(input);
      if (this.isValidIntent(result)) return result;
      this.logger.debug('Intent analysis malformed; using fallback.');
    } catch (err) {
      this.logger.warn(`Intent analysis failed; using fallback: ${err}`);
    }
    return this.fallbackIntent(input);
  }

  private isValidIntent(value: unknown): value is IntentAnalysis {
    const v = value as Partial<IntentAnalysis> | null;
    return (
      !!v &&
      typeof v.summary === 'string' &&
      v.summary.length > 0 &&
      Array.isArray(v.primaryUsers)
    );
  }

  private fallbackIntent(input: ProjectIdeaInput): IntentAnalysis {
    return {
      summary: input.idea.trim(),
      domain: input.industry ?? 'unspecified',
      primaryUsers: [],
      coreCapabilities: [],
      openQuestions: [
        'Requirements will be refined through the interview below.',
      ],
    };
  }

  /**
   * Pick the next question (or close the gate) and update the session. Tries the
   * adaptive interviewer first; falls back to the deterministic question plan
   * when the model is unavailable or non-conforming (e.g. mock mode / tests).
   */
  private async advance(session: InterviewSession): Promise<void> {
    const next = await this.decideNext(session);
    session.coverage = round2(next.coverage);
    if (next.done) {
      session.status = 'awaiting_confirmation';
      session.summary = this.buildSummary(session);
      session.pendingQuestion = null;
    } else {
      session.pendingQuestion = next.question;
    }
  }

  private async decideNext(
    session: InterviewSession,
  ): Promise<InterviewDecision> {
    // Hard cap so a real model can't ask forever.
    if (session.history.length >= MAX_ADAPTIVE_QUESTIONS) {
      return { done: true, coverage: 1, question: null };
    }
    const adaptive = await this.tryAdaptive(session);
    return adaptive ?? this.planDecision(session);
  }

  /** Ask the real-AI interviewer for the next question; null if unusable. */
  private async tryAdaptive(
    session: InterviewSession,
  ): Promise<InterviewDecision | null> {
    try {
      // Ask in whatever language the user is writing in — an Arabic idea (and
      // Arabic answers) get Arabic questions back.
      const language = detectLanguage(
        [session.input.idea, ...session.history.map((h) => h.answer)].join(' '),
      );
      const d = await this.interviewer.decide({
        idea: session.input.idea,
        intent: session.intent,
        history: session.history,
        language,
      });
      if (!d || typeof d.done !== 'boolean') return null;

      const coverage = clamp01(typeof d.coverage === 'number' ? d.coverage : 0);
      const canFinish = session.history.length >= MIN_ADAPTIVE_QUESTIONS;

      if (d.done && canFinish) {
        return {
          done: true,
          coverage: Math.max(coverage, COMPLETENESS_THRESHOLD),
          question: null,
        };
      }
      if (typeof d.question === 'string' && d.question.trim().length > 0) {
        const options = Array.isArray(d.options)
          ? d.options
              .map((o) => String(o).trim())
              .filter(Boolean)
              .slice(0, 6)
          : [];
        return {
          done: false,
          coverage,
          question: {
            id: `q${session.history.length + 1}`,
            phase: this.resolvePhase(d.phase, session),
            prompt: d.question.trim(),
            ...(options.length ? { options } : {}),
            ...(typeof d.multiple === 'boolean' ? { multiple: d.multiple } : {}),
          },
        };
      }
      // "done" too early, or no question supplied → let the plan provide one.
      return null;
    } catch (err) {
      this.logger.warn(`Adaptive interview failed; using question plan: ${err}`);
      return null;
    }
  }

  /**
   * Deterministic backbone. Picks the next plan question BY POSITION (not "first
   * unanswered id") so that an adaptive→plan fallback mid-interview continues
   * forward instead of restarting at question 1 — adaptive questions use `q*`
   * ids that never match the plan's `a1/b1/…` ids. Coverage is non-decreasing so
   * a transient model failure never drops the progress bar.
   *
   * In pure plan mode this is equivalent to the old behaviour: after N answers
   * (a1..aN, answered in order) `QUESTION_PLAN[N]` is exactly the next question.
   */
  private planDecision(session: InterviewSession): InterviewDecision {
    const question = QUESTION_PLAN[session.history.length] ?? null;
    const coverage = Math.max(
      session.coverage,
      session.history.length / TOTAL_QUESTIONS,
    );
    const done = question === null || coverage >= COMPLETENESS_THRESHOLD;
    return { done, coverage, question: done ? null : question };
  }

  /** Map a free-text phase from the model onto a known phase. */
  private resolvePhase(
    raw: string | undefined,
    session: InterviewSession,
  ): InterviewPhase {
    const match = INTERVIEW_PHASE_ORDER.find((p) => p === raw);
    if (match) return match;
    const idx = Math.min(
      session.history.length,
      INTERVIEW_PHASE_ORDER.length - 1,
    );
    return INTERVIEW_PHASE_ORDER[idx];
  }

  private answersForPhase(
    session: InterviewSession,
    phase: InterviewPhase,
  ): string[] {
    return session.history
      .filter((h) => h.question.phase === phase && h.answer.length > 0)
      .map((h) => h.answer);
  }

  /**
   * Deterministic requirements preview from the collected answers. The formal
   * Requirement Document is produced by the Requirement Engineer downstream.
   */
  private buildSummary(session: InterviewSession): RequirementsSummary {
    const understanding = this.answersForPhase(
      session,
      InterviewPhase.Understanding,
    );
    return {
      goal: understanding[0] ?? session.intent?.summary ?? session.input.idea,
      users: dedupe([
        ...(session.intent?.primaryUsers ?? []),
        ...understanding.slice(1),
      ]),
      features: this.answersForPhase(session, InterviewPhase.Features),
      businessRules: this.answersForPhase(
        session,
        InterviewPhase.BusinessLogic,
      ),
      constraints: [
        ...this.answersForPhase(session, InterviewPhase.Technical),
        ...this.answersForPhase(session, InterviewPhase.Scale),
      ],
      assumptions: [
        'Derived from a structured interview; pending formal requirement engineering in the next stage.',
      ],
    };
  }

  private toState(session: InterviewSession): InterviewState {
    const currentQuestion =
      session.status === 'collecting' ? session.pendingQuestion : null;
    return {
      sessionId: session.id,
      status: session.status,
      phase: currentQuestion?.phase ?? null,
      completeness: round2(session.coverage),
      intent: session.intent,
      history: session.history as InterviewExchange[],
      currentQuestion,
      summary: session.summary,
    };
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((v) => v && v.trim().length > 0))];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
