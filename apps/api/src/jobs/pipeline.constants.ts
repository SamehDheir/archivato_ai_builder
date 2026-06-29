/** BullMQ queue + job names for async pipeline generation. */
export const PIPELINE_QUEUE = 'pipeline';
export const GENERATE_JOB = 'generate';

/** Payload carried by every generation job. */
export interface GenerateJobData {
  sessionId: string;
  stage: import('@archivato/shared').PipelineStageName;
}
