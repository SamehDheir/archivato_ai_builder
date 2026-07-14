import type {
  AgentRole,
  LlmMessage,
  LlmUsage,
  LlmCompleteOptions as SharedLlmCompleteOptions,
} from '@archivato/shared';

export type { LlmMessage, LlmUsage };

/** What a provider reports back about one completed model call. */
export interface LlmUsageReport {
  /** The model actually used (an `options.model` override, else the default). */
  model: string;
  usage: LlmUsage;
}

/**
 * The shared options plus two API-internal plumbing fields. Neither is ever sent
 * to a model — providers build their request payloads field by field.
 *
 * `agent` is stamped by `BaseAgent`, so every call is attributable to the agent
 * that made it without touching all 14 agent implementations. `onUsage` is set
 * ONLY by `UsageTrackingLlmProvider`: it's how token counts get *out* of a
 * provider without changing `complete()`'s return type (and without the racy
 * "usage of the last call" field a concurrent pipeline would scramble).
 */
export interface LlmCompleteOptions extends SharedLlmCompleteOptions {
  agent?: AgentRole;
  onUsage?: (report: LlmUsageReport) => void;
}

/**
 * The single seam through which the whole platform talks to an LLM.
 *
 * Every agent depends on this interface — never on a concrete provider — so we
 * can run the entire pipeline offline against `MockLlmProvider` and swap in
 * `ClaudeLlmProvider` (or any future provider) without touching agent code.
 */
export interface LlmProvider {
  /** Human-readable id, e.g. "mock" or "claude". */
  readonly name: string;

  /** The model used when a call doesn't override it (metering + reporting). */
  readonly defaultModel: string;

  /** Free-form text completion. */
  complete(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<string>;

  /**
   * Completion constrained to a single JSON object, parsed into `T`.
   * Implementations must strip markdown code fences and throw
   * `LlmJsonParseError` if the response is not valid JSON.
   */
  completeJson<T>(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T>;
}

/** DI token for injecting the active `LlmProvider` (used by all design agents). */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * DI token for the provider used specifically by the adaptive interview. Lets us
 * run real AI for the interview (e.g. Groq) while the rest of the pipeline stays
 * on the default provider — see `LlmModule`.
 */
export const INTERVIEW_LLM_PROVIDER = Symbol('INTERVIEW_LLM_PROVIDER');

/** Thrown when an LLM response can't be parsed as the expected JSON. */
export class LlmJsonParseError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'LlmJsonParseError';
  }
}
