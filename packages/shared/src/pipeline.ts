/**
 * The Archivato generation pipeline:
 *
 *   User Input → Intent Analysis → Interview Loop → Requirements →
 *   System Design → DB Design → API Design → Review → Export
 *
 * Stages run in this order; a project session advances through them.
 */
export enum PipelineStage {
  IntentAnalysis = 'intent_analysis',
  Interview = 'interview',
  Requirements = 'requirements',
  SystemDesign = 'system_design',
  DatabaseDesign = 'database_design',
  ApiDesign = 'api_design',
  Review = 'review',
  Export = 'export',
}

/** Ordered list of stages — useful for "what comes next" logic. */
export const PIPELINE_ORDER: readonly PipelineStage[] = [
  PipelineStage.IntentAnalysis,
  PipelineStage.Interview,
  PipelineStage.Requirements,
  PipelineStage.SystemDesign,
  PipelineStage.DatabaseDesign,
  PipelineStage.ApiDesign,
  PipelineStage.Review,
  PipelineStage.Export,
] as const;

export type ProjectScale = 'mvp' | 'startup' | 'enterprise';

/** The raw idea a user submits to kick off a session. */
export interface ProjectIdeaInput {
  idea: string;
  industry?: string;
  scale?: ProjectScale;
  preferredStack?: string;
}
