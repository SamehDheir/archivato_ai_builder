import {
  BadRequestException,
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
  resolveExtendedArtifacts,
  INTERVIEW_MAX_QUESTIONS,
  INTERVIEW_PHASE_ORDER,
  InterviewPhase,
  isPlanModeTranscript,
  isUnlimitedQuota,
  startOfQuotaPeriod,
  type ArtifactLanguage,
  type InterviewExchange,
  type InterviewQuestion,
  type InterviewState,
  type IntentAnalysis,
  type OpenQuestion,
  type ProjectIdeaInput,
  type ProjectSummary,
  type RequirementsSummary,
  type SlotMap,
} from '@archivato/shared';
import {
  bindAnswerToSlot,
  isSlotKey,
  mergeSlots,
  notesHistoryEntry,
  reconcileOpenQuestions,
  summaryFromSlots,
  SLOT_CATALOG,
} from './slots';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from './interview-session.repository';
import {
  resolveArtifactLanguage,
  type InterviewSession,
} from './interview-session.entity';
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
  /** Slot values extracted this turn (adaptive path only; plan mode fills none). */
  slots?: SlotMap;
  /** Gaps to forward to the client, surfaced this turn. */
  openQuestions?: OpenQuestion[];
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
    clientName: string | null = null,
    notes: string | null = null,
  ): Promise<InterviewState> {
    // Enforce the plan's quota, which is a **creation rate per calendar month**
    // (Starter = 1/month), not a lifetime count of projects owned: last month's
    // design must not be held against this month.
    //
    // The meter is still the project list — there is no usage table (see the
    // billing notes) — which leaves one accepted hole: a *deleted* project stops
    // being counted, so a Starter user can delete-and-retry within a month. That
    // is not a regression (the old owned-count quota behaved the same) and it
    // costs them the design they delete, so it buys nothing but a re-run. Closing
    // it needs creations recorded somewhere that survives the delete. Pinned by a
    // test in `project-quota.spec.ts` so it stays a decision, not a surprise.
    //
    // Team is unlimited and skips the check entirely. Owner-less sessions are
    // never metered (unit tests drive the state machine).
    if (userId) {
      const quota = await this.billing.getProjectQuota(userId);
      if (!isUnlimitedQuota(quota)) {
        const used = await this.repo.countByUserIdCreatedSince(
          userId,
          startOfQuotaPeriod(),
        );
        if (used >= quota!) {
          throw new HttpException(
            {
              statusCode: HttpStatus.PAYMENT_REQUIRED,
              error: 'Payment Required',
              code: 'quota_exceeded',
              message:
                quota === 1
                  ? 'Your Starter plan includes 1 design per month. Upgrade to Team for unlimited designs, or wait until next month.'
                  : `You've used all ${quota} designs included in your plan this month. Upgrade to Team for unlimited designs, or wait until next month.`,
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }
    }
    const now = new Date();
    const session: InterviewSession = {
      id: randomUUID(),
      userId,
      input,
      title: null,
      clientName: blankToNull(clientName),
      weeklyRate: null,
      status: 'collecting',
      intent: await this.analyzeIntent(input),
      history: [],
      pendingQuestion: null,
      coverage: 0,
      summary: null,
      slots: null,
      openQuestions: null,
      fixLog: null,
      proposalDrafts: null,
      // Null = not decided: the budget-derived default applies on read, so the
      // toggle at the gate keeps tracking a corrected budget until the owner
      // touches it. `confirm()` pins whatever it lands on.
      generateExtendedArtifacts: null,
      // Null = never chosen, so `resolveArtifactLanguage` derives it from the
      // idea. Not stamped here for the same reason the flag above is not: the
      // owner may still rewrite the idea, and a language pinned at the moment of
      // creation would ignore the correction. `confirm()` pins one.
      artifactLanguage: null,
      createdAt: now,
      updatedAt: now,
    };
    // Notes-first mode: the pasted call notes become the first transcript entry,
    // then the SAME advance() loop runs — no parallel path. The first adaptive
    // turn will extract many slots at once and ask about the first real gap; in
    // plan mode the notes are simply answer #0 and the linear plan continues from
    // position 1.
    const trimmedNotes = notes?.trim();
    if (trimmedNotes) {
      session.history.push(notesHistoryEntry(trimmedNotes));
    }
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
    // R12 — pin the extended-artifacts answer. Until now it could still be null
    // ("not decided"), tracking the budget slot; confirming is the moment that stops
    // being editable, so every confirmed project carries an explicit value instead
    // of one that depends on re-parsing a sentence later.
    session.generateExtendedArtifacts = resolveExtendedArtifacts(
      session.generateExtendedArtifacts,
      session.slots,
    );
    // Pin the artifact language for the same reason and at the same moment. Up
    // to here it tracked the idea, which the owner could still rewrite; from here
    // the pipeline starts generating, and every artifact must be written in the
    // same language as the one before it. Deriving it per stage instead would let
    // an idea edited mid-pipeline produce a package that changes language halfway
    // through — the exact half-translated document this whole system prevents.
    session.artifactLanguage = resolveArtifactLanguage(session);
    await this.repo.save(session);
    return this.toState(session);
  }

  /** Delete a project (owner-guarded at the controller); cascades its artifacts. */
  async deleteProject(sessionId: string): Promise<void> {
    await this.require(sessionId); // 404 if it doesn't exist
    await this.repo.delete(sessionId);
  }

  /**
   * Update a project's owner-facing labels — its display name and/or the client
   * it's scoped for (owner-guarded at the controller).
   *
   * A field left **undefined** is untouched; a **blank** one is cleared (the title
   * falls back to the idea). That distinction is why this takes a patch object
   * rather than two positional strings: renaming a project must not wipe the
   * client it was scoped for. Never touches the idea — the AI's source of truth.
   */
  async update(
    sessionId: string,
    patch: {
      title?: string;
      clientName?: string;
      weeklyRate?: number | null;
      generateExtendedArtifacts?: boolean;
      artifactLanguage?: ArtifactLanguage;
    },
  ): Promise<ProjectSummary> {
    const session = await this.require(sessionId);
    if (patch.title !== undefined) session.title = blankToNull(patch.title);
    if (patch.clientName !== undefined) {
      session.clientName = blankToNull(patch.clientName);
    }
    // undefined = untouched; null = clear; a number sets the rate.
    if (patch.weeklyRate !== undefined) {
      session.weeklyRate = patch.weeklyRate ?? null;
    }
    // R12 — the owner's override, from the confirmation-gate toggle or the later
    // "generate security & QA artifacts" action. Turning it back on is the whole
    // activation path: no new endpoint, no new pipeline state — the stages simply
    // become visible and generate the way they always did.
    if (patch.generateExtendedArtifacts !== undefined) {
      session.generateExtendedArtifacts = patch.generateExtendedArtifacts;
    }
    // The owner's explicit language choice. It is accepted **after** confirm too:
    // an owner who realises the package should go to an English-reading
    // stakeholder sets it here and regenerates. It deliberately does NOT
    // retranslate anything already written — artifacts are stamped with the
    // language they were generated in, and only a regeneration rewrites one.
    if (patch.artifactLanguage !== undefined) {
      session.artifactLanguage = patch.artifactLanguage;
    }
    await this.repo.save(session);
    return this.toSummary(session);
  }

  async getState(sessionId: string): Promise<InterviewState> {
    return this.toState(await this.require(sessionId));
  }

  /**
   * Correct a slot value at the confirmation gate (owner-guarded at the
   * controller). Because the **transcript is the source of truth**, this appends
   * a correction turn to `history` and then updates the derived snapshot to match
   * — so a later re-derivation from history sees the correction, and the two never
   * disagree. The corrected value is always `explicit`/`high` (the owner stated it
   * outright), which by the merge rules can never be silently overwritten by a
   * later inference.
   *
   * Allowed only before the interview is confirmed — once locked, the requirements
   * are generated and editing a slot would desync the transcript from the design.
   */
  async editSlot(
    sessionId: string,
    slotKey: string,
    value: string,
  ): Promise<InterviewState> {
    const session = await this.require(sessionId);
    if (session.status === 'confirmed') {
      throw new ConflictException(
        'The interview is already confirmed; slots can no longer be edited.',
      );
    }
    if (!isSlotKey(slotKey)) {
      throw new BadRequestException(`Unknown slot "${slotKey}".`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('A slot value cannot be empty.');
    }

    // 1) Transcript first — the correction is a real turn in the conversation.
    session.history.push({
      question: {
        id: `correction:${slotKey}`,
        phase: session.pendingQuestion?.phase ?? InterviewPhase.Understanding,
        prompt: `Correction — ${SLOT_CATALOG[slotKey].description}`,
      },
      answer: trimmed,
    });

    // 2) Snapshot follows: an explicit, high-confidence value the merge rules
    //    protect from any later inference.
    const slots: SlotMap = {
      ...(session.slots ?? {}),
      [slotKey]: { value: trimmed, confidence: 'high', source: 'explicit' },
    };
    session.slots = slots;
    // An answered gap is no longer open.
    session.openQuestions = reconcileOpenQuestions(
      session.openQuestions ?? [],
      undefined,
      slots,
    );

    await this.repo.save(session);
    return this.toState(session);
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
      clientName: s.clientName ?? undefined,
      status: s.status,
      completeness: round2(s.coverage),
      weeklyRate: s.weeklyRate ?? null,
      generateExtendedArtifacts: resolveExtendedArtifacts(
        s.generateExtendedArtifacts,
        s.slots,
      ),
      // Derived while the column is null, so the dashboard shows the language the
      // project would actually generate in rather than a blank.
      artifactLanguage: resolveArtifactLanguage(s),
      // The per-month quota's meter: the client counts what was created this
      // period rather than what is owned (see `countInQuotaPeriod`).
      createdAt: s.createdAt.toISOString(),
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

    // Fold any slot extractions from this turn onto the session BEFORE deciding
    // status, so the summary at the gate reflects the final turn's slots too. The
    // merge is guardrailed in `mergeSlots` (explicit beats inferred, never the
    // reverse); reconciliation drops an open question once its slot is answered.
    // Plan-mode turns carry no slots, so this is a no-op there — slots simply stay
    // empty, which every consumer tolerates.
    // The backstop: bind the last answer to the slot its question was asked to
    // fill, whenever the model's own extraction skipped it. See `bindAnswerToSlot`.
    const extracted = bindAnswerToSlot(session.history, next.slots);

    if (extracted || next.openQuestions) {
      const slots = mergeSlots(session.slots ?? {}, extracted);
      session.slots = slots;
      session.openQuestions = reconcileOpenQuestions(
        session.openQuestions ?? [],
        next.openQuestions,
        slots,
      );
    }

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
        slots: session.slots ?? {},
        language,
      });
      if (!d || typeof d.done !== 'boolean') return null;

      const coverage = clamp01(typeof d.coverage === 'number' ? d.coverage : 0);
      const canFinish = session.history.length >= MIN_ADAPTIVE_QUESTIONS;
      // The model's slot extractions + open questions ride along on every turn,
      // sanitized to the known shape; `advance()` merges them onto the session.
      const slots = this.sanitizeSlots(d.slots);
      const openQuestions = this.sanitizeOpenQuestions(d.openQuestions);

      if (d.done && canFinish) {
        return {
          done: true,
          coverage: Math.max(coverage, COMPLETENESS_THRESHOLD),
          question: null,
          slots,
          openQuestions,
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
          slots,
          openQuestions,
          question: {
            id: `q${session.history.length + 1}`,
            phase: this.resolvePhase(d.phase, session),
            prompt: d.question.trim(),
            ...(options.length ? { options } : {}),
            ...(typeof d.multiple === 'boolean' ? { multiple: d.multiple } : {}),
            // Untrusted model output — an unrecognized key is simply dropped
            // (the `sanitizeSlots` allowlist rule), never written through.
            ...(d.targetSlot && isSlotKey(d.targetSlot)
              ? { targetSlot: d.targetSlot }
              : {}),
          },
        };
      }
      // "done" too early, or no question supplied → let the plan provide one. The
      // slots extracted this turn are still returned so nothing the model learned
      // is lost when we fall through to the plan for the QUESTION.
      return slots || openQuestions
        ? { ...this.planDecision(session), slots, openQuestions }
        : null;
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

  /**
   * Coerce the model's `slots` into the known shape — an LLM's JSON is untrusted.
   * Drops unknown keys, non-string/empty values, and bad enums; returns undefined
   * when nothing valid survives (so `advance()` treats the turn as slot-free).
   */
  private sanitizeSlots(raw: unknown): SlotMap | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const out: SlotMap = {};
    let any = false;
    for (const [key, value] of Object.entries(raw)) {
      if (!isSlotKey(key) || !value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const na = v.na === true;
      const text = typeof v.value === 'string' ? v.value.trim() : '';
      // A real slot needs a value; an n/a slot doesn't (it's a "skip this" marker).
      if (!na && text.length === 0) continue;
      out[key] = {
        value: text,
        confidence: v.confidence === 'high' ? 'high' : 'low',
        source: v.source === 'explicit' ? 'explicit' : 'inferred',
        ...(na ? { na: true } : {}),
        ...(na && typeof v.naReason === 'string'
          ? { naReason: v.naReason.trim() }
          : {}),
      };
      any = true;
    }
    return any ? out : undefined;
  }

  /** Coerce the model's `openQuestions` into the known shape (untrusted JSON). */
  private sanitizeOpenQuestions(raw: unknown): OpenQuestion[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out = (raw as unknown[])
      .filter(
        (q): q is OpenQuestion =>
          !!q &&
          typeof q === 'object' &&
          typeof (q as OpenQuestion).slotKey === 'string' &&
          isSlotKey((q as OpenQuestion).slotKey) &&
          typeof (q as OpenQuestion).questionForClient === 'string' &&
          (q as OpenQuestion).questionForClient.trim().length > 0,
      )
      .map((q) => ({
        slotKey: q.slotKey,
        questionForClient: q.questionForClient.trim(),
      }));
    return out.length ? out : undefined;
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
   *
   * Two sources, and which one is authoritative depends on how the interview ran:
   *
   * - **Adaptive (a real model):** the questions are chosen to fill slots, and
   *   `question.phase` is a free-text label the model attaches after the fact. It
   *   is NOT a reliable bucket — several unrelated answers land under one phase
   *   and whole phases are never used at all. So the slot snapshot wins, and the
   *   positional fallbacks are deliberately NOT applied: reading "every
   *   Understanding answer after the first" as the user roles is what turned the
   *   data-entity, integrations and market answers into roles.
   * - **Plan mode (offline / no model):** there are no slots, but the phase
   *   labels are exact, because `QUESTION_PLAN` hard-codes them per question.
   *   The positional reads are correct there and are kept.
   */
  private buildSummary(session: InterviewSession): RequirementsSummary {
    const understanding = this.answersForPhase(
      session,
      InterviewPhase.Understanding,
    );
    const fromSlots = summaryFromSlots(session.slots);
    // Identity, not a symptom. This was `hasFilledSlots(session.slots)` — "did
    // any slot get filled" standing in for "is this plan mode" — which reads an
    // adaptive run whose extraction failed as a plan run, and then buckets its
    // transcript by `question.phase`, a label the model invented. That is how raw
    // answers about data entities ended up rendered as the project's user roles.
    const planMode = isPlanModeTranscript(session.history as InterviewExchange[]);

    return {
      // In plan mode the first Understanding answer IS the goal question; in an
      // adaptive run it is whatever the model opened with, so the intent summary
      // (a written sentence about the concept) is the better source.
      goal:
        (planMode ? understanding[0]?.trim() : session.intent?.summary?.trim()) ||
        understanding[0]?.trim() ||
        session.intent?.summary?.trim() ||
        session.input.idea,
      users:
        fromSlots.users ??
        dedupe([
          ...(session.intent?.primaryUsers ?? []),
          ...(planMode ? understanding.slice(1) : []),
        ]),
      features:
        fromSlots.features ??
        (planMode ? this.answersForPhase(session, InterviewPhase.Features) : []),
      // Was the ONE field the slot migration missed, and it stayed on the raw
      // positional path unguarded — so on every adaptive run it dumped the entire
      // verbatim answer to whatever question the model happened to label
      // `business_logic` straight into a structured, client-facing field. A real
      // gate rendered a five-workflow essay, `$\rightarrow$` artifacts included,
      // as this project's business rules.
      //
      // There is deliberately no `business_rules` slot to read instead: a rule is
      // a policy, and the interview extracts *what the system does*, not the
      // policies governing it. So outside plan mode this is empty on purpose —
      // the Requirement Engineer derives real business rules from the full
      // transcript downstream, which is the stage equipped to do it. Empty and
      // honest beats populated and wrong in a document a client reads.
      businessRules: planMode
        ? this.answersForPhase(session, InterviewPhase.BusinessLogic)
        : [],
      // The Commercial phase (budget + timeline) is deliberately absent. Those are
      // real design constraints, but they reach the design through the slots that
      // now carry them — and this list flows into the Requirement Document, which
      // must never state a budget or a date.
      // Technical answers only. The Scale phase used to be concatenated here as
      // well, which put the same paragraph in two fields of a document a client
      // reads — the verbatim duplication reported against the Constraints
      // section. Scale has its own field now, on both paths.
      constraints:
        fromSlots.constraints ??
        (planMode ? this.answersForPhase(session, InterviewPhase.Technical) : []),
      scale:
        fromSlots.scale ??
        (planMode ? this.answersForPhase(session, InterviewPhase.Scale) : []),
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
      // Always present (possibly empty) so the confirmation gate can render the
      // filled slots + the questions-for-your-client list without a null check.
      slots: session.slots ?? {},
      openQuestions: session.openQuestions ?? [],
      // Derived on read while it's still null, so correcting `budget_range` at the
      // gate moves the toggle — the whole point of the marker.
      generateExtendedArtifacts: resolveExtendedArtifacts(
        session.generateExtendedArtifacts,
        session.slots,
      ),
      // Same derive-on-read rule: the gate shows (and lets the owner change) the
      // language the pipeline is about to generate in, not a stored null.
      artifactLanguage: resolveArtifactLanguage(session),
    };
  }
}

/** A user-typed label: blank (or absent) means "no value", not an empty string. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
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
