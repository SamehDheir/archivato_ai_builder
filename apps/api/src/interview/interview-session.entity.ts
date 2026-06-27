import type {
  InterviewExchange,
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
  input: ProjectIdeaInput;
  status: InterviewStatus;
  intent: IntentAnalysis | null;
  /** Answered questions, in the order they were asked. */
  history: InterviewExchange[];
  summary: RequirementsSummary | null;
  createdAt: Date;
  updatedAt: Date;
}
