/**
 * Async pipeline generation (BullMQ/Redis). Heavy generation stages are run by a
 * background worker; the client enqueues a job and polls its status until the
 * artifact is ready. Keep these types runtime-free (shared by api + web).
 */

/** The pipeline stages that can be generated asynchronously. */
export type PipelineStageName =
  | 'requirements'
  | 'system-design'
  | 'database-design'
  | 'api-design'
  | 'review';

/** The ordered list of async-generatable stages. */
export const PIPELINE_STAGES: readonly PipelineStageName[] = [
  'requirements',
  'system-design',
  'database-design',
  'api-design',
  'review',
] as const;

/** Lifecycle of a queued job (mirrors BullMQ's job states, normalized). */
export type JobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'unknown';

/** A job's current status, returned by enqueue and polled thereafter. */
export interface JobStatus {
  id: string;
  sessionId: string;
  stage: PipelineStageName;
  state: JobState;
  /** 0..100 progress (best-effort; stages report start/finish). */
  progress: number;
  /** The generated artifact once `state === 'completed'`. */
  result?: unknown;
  /** Failure reason once `state === 'failed'`. */
  error?: string;
}
