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
  InterviewPhase,
  type InterviewExchange,
  type InterviewQuestion,
  type InterviewState,
  type IntentAnalysis,
  type ProjectIdeaInput,
  type RequirementsSummary,
} from '@archivato/shared';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from './interview-session.repository';
import type { InterviewSession } from './interview-session.entity';
import { QUESTION_PLAN, TOTAL_QUESTIONS } from './question-plan';

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly repo: InterviewSessionRepository,
    private readonly productAnalyst: ProductAnalystAgent,
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
      summary: null,
      createdAt: now,
      updatedAt: now,
    };
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

    const question = this.nextQuestion(session);
    if (!question) {
      // Shouldn't happen while collecting, but guard anyway.
      throw new ConflictException('No question is currently pending.');
    }

    session.history.push({ question, answer: answer.trim() });

    // Reached the gate? Summarize and wait for confirmation.
    if (this.completeness(session) >= COMPLETENESS_THRESHOLD) {
      session.status = 'awaiting_confirmation';
      session.summary = this.buildSummary(session);
    }

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

  /** First unanswered question in plan order, or null if all answered. */
  private nextQuestion(session: InterviewSession): InterviewQuestion | null {
    const answeredIds = new Set(session.history.map((h) => h.question.id));
    return QUESTION_PLAN.find((q) => !answeredIds.has(q.id)) ?? null;
  }

  private completeness(session: InterviewSession): number {
    return session.history.length / TOTAL_QUESTIONS;
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
      session.status === 'collecting' ? this.nextQuestion(session) : null;
    return {
      sessionId: session.id,
      status: session.status,
      phase: currentQuestion?.phase ?? null,
      completeness: round2(this.completeness(session)),
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
