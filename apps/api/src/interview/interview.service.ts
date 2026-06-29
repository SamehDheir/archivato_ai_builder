import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  COMPLETENESS_THRESHOLD,
  INTERVIEW_PHASE_ORDER,
  InterviewPhase,
  type InterviewExchange,
  type InterviewQuestion,
  type InterviewState,
  type IntentAnalysis,
  type ProjectIdeaInput,
  type RequirementsSummary,
} from '@archivato/shared';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from './interview-session.repository';
import type { InterviewSession } from './interview-session.entity';
import { QUESTION_PLAN, TOTAL_QUESTIONS } from './question-plan';

/** Adaptive interview caps so a real model can't end too early or run forever. */
const MIN_ADAPTIVE_QUESTIONS = 4;
const MAX_ADAPTIVE_QUESTIONS = 12;

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
  ) {}

  /** Start a new interview from a raw idea and return the first question. */
  async start(input: ProjectIdeaInput): Promise<InterviewState> {
    const now = new Date();
    const session: InterviewSession = {
      id: randomUUID(),
      input,
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

  async getState(sessionId: string): Promise<InterviewState> {
    return this.toState(await this.require(sessionId));
  }

  // ── internals ─────────────────────────────────────────────────────────

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
      const d = await this.interviewer.decide({
        idea: session.input.idea,
        intent: session.intent,
        history: session.history,
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
        return {
          done: false,
          coverage,
          question: {
            id: `q${session.history.length + 1}`,
            phase: this.resolvePhase(d.phase, session),
            prompt: d.question.trim(),
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

  /** Deterministic backbone: next unanswered plan question + length coverage. */
  private planDecision(session: InterviewSession): InterviewDecision {
    const answeredIds = new Set(session.history.map((h) => h.question.id));
    const question = QUESTION_PLAN.find((q) => !answeredIds.has(q.id)) ?? null;
    const coverage = session.history.length / TOTAL_QUESTIONS;
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
