import type { LlmMessage, LlmCompleteOptions } from '@archivato/shared';

export type { LlmMessage, LlmCompleteOptions };

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
