import type {
  InterviewExchange,
  InterviewQuestion,
  InterviewStatus,
  IntentAnalysis,
  RequirementsSummary,
  ProjectIdeaInput,
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
  createdAt: Date;
  updatedAt: Date;
}
