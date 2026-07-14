import type { AgentRole } from '@archivato/shared';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';

/**
 * Base class for every specialized agent (Product Analyst, System Architect,
 * Reviewer, …). A concrete agent declares its `role` and `systemPrompt`, then
 * implements its public method(s) by calling the protected `think*` helpers.
 *
 * Agents depend only on the `LlmProvider` interface, never a concrete provider.
 */
export abstract class BaseAgent {
  /** Which pipeline role this agent fulfils. */
  abstract readonly role: AgentRole;

  /** The persona / instructions sent as the system prompt on every call. */
  protected abstract readonly systemPrompt: string;

  constructor(protected readonly llm: LlmProvider) {}

  /**
   * Free-form text reasoning. Stamps `agent` on the options so the usage meter
   * can attribute the tokens without any agent having to know it's being metered.
   */
  protected async think(
    userPrompt: string,
    options?: LlmCompleteOptions,
  ): Promise<string> {
    return this.llm.complete(this.buildMessages(userPrompt), {
      system: this.systemPrompt,
      ...options,
      agent: this.role,
    });
  }

  /** Structured reasoning — returns a parsed, typed JSON result. */
  protected async thinkJson<T>(
    userPrompt: string,
    options?: LlmCompleteOptions,
  ): Promise<T> {
    return this.llm.completeJson<T>(this.buildMessages(userPrompt), {
      system: this.systemPrompt,
      ...options,
      agent: this.role,
    });
  }

  private buildMessages(userPrompt: string): LlmMessage[] {
    return [{ role: 'user', content: userPrompt }];
  }
}
