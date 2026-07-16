import type {
  FixLogEntry,
  InterviewExchange,
  InterviewQuestion,
  InterviewStatus,
  IntentAnalysis,
  OpenQuestion,
  RequirementsSummary,
  ProjectIdeaInput,
  SlotMap,
} from '@archivato/shared';

/**
 * The persisted state of one interview session. Today this lives in memory;
 * the persistence slice maps it onto a Prisma model with the same shape.
 */
export interface InterviewSession {
  id: string;
  /** Owner (authenticated user id). Null only for legacy pre-ownership rows. */
  userId: string | null;
  input: ProjectIdeaInput;
  /** Optional user-set display name; falls back to the idea when null. */
  title: string | null;
  /**
   * The end client this scoping is for (optional). Deliberately a sibling of
   * `input`, not a field inside it: `input` is what the agents read, and the
   * client's name is a label for the owner's dashboard — it must never leak into
   * a prompt or onto the public share page.
   */
  clientName: string | null;
  /**
   * The owner's internal weekly rate (USD/person-week) for pricing this project
   * (R9). Owner-only — never crosses onto the public share page.
   */
  weeklyRate: number | null;
  status: InterviewStatus;
  intent: IntentAnalysis | null;
  /** Answered questions, in the order they were asked. */
  history: InterviewExchange[];
  /**
   * The question currently awaiting an answer (adaptive questions are generated,
   * so the pending one must be stored rather than recomputed). Null at the gate.
   */
  pendingQuestion: InterviewQuestion | null;
  /** Latest requirement-coverage estimate, 0..1 (drives the progress bar). */
  coverage: number;
  summary: RequirementsSummary | null;
  /**
   * The derived slot snapshot (R6) — a cache over `history`, never authoritative
   * over it. Null on legacy rows and pure plan-mode runs; consumers must tolerate
   * that (an absent snapshot reads as "no slots filled").
   */
  slots: SlotMap | null;
  /** Gaps to forward to the client, accumulated as the interview couldn't fill them. */
  openQuestions: OpenQuestion[] | null;
  /**
   * Append-only record of the review fixes the owner approved (R11). Null on rows
   * predating it, and on any project where no fix was ever applied.
   *
   * It lives on the session, not the review, because a re-run replaces the review
   * row (statuses reset — a re-run is a fresh assessment) and the review is carried
   * in version snapshots, so a restore would rewind a log stored there.
   */
  fixLog: FixLogEntry[] | null;
  createdAt: Date;
  updatedAt: Date;
}
