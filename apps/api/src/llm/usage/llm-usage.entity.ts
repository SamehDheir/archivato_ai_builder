import type { AgentRole, LlmUsageStage } from '@archivato/shared';

/**
 * One metered model call. Counts only — never prompt or completion CONTENT, so
 * this store can be reported on by a role with no project access.
 */
export interface LlmUsageRecord {
  id: string;
  /** Provider name as reported by the `LlmProvider` (mock/claude/groq/azure). */
  provider: string;
  model: string;
  /** Which agent made the call, when it came through `BaseAgent`. */
  agent: AgentRole | null;
  stage: LlmUsageStage;
  userId: string | null;
  sessionId: string | null;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  cacheWritePromptTokens: number;
  /** Null when the model has no price in the shared catalog — NOT free. */
  costUsd: number | null;
  /** False when the provider call threw (timeout, HTTP error, bad JSON). */
  ok: boolean;
  durationMs: number;
  createdAt: Date;
}
