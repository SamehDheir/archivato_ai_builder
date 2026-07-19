import { Logger } from '@nestjs/common';
import type {
  AgentRole,
  DegradedReason,
  GenerationProvenance,
} from '@archivato/shared';
import { UNTRUSTED_INPUT_RULES } from '@archivato/shared';
import type {
  LlmProvider,
  LlmMessage,
  LlmCompleteOptions,
} from './llm-provider.interface';
import { LlmJsonParseError } from './llm-provider.interface';
import { LlmHttpError, isGenerationFailure, isRequestTooLarge } from './llm-http';

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
      system: this.hardenedSystemPrompt,
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
      system: this.hardenedSystemPrompt,
      ...options,
      agent: this.role,
    });
  }

  /**
   * The agent's persona with `UNTRUSTED_INPUT_RULES` appended — the instruction
   * hierarchy that gives `untrusted()`'s fence its meaning.
   *
   * It is applied **here** rather than written into each agent's `systemPrompt`
   * for the reason `generateArtifact` exists: fourteen agents interpolate client
   * text, and a rule each one states by hand is a rule the fifteenth agent
   * forgets. This way a new agent is defended before it is written.
   *
   * Cached because the string must be *stable* across calls, not merely equal:
   * `ClaudeLlmProvider` marks the system prompt with `cache_control`, and a
   * freshly built prompt per call would defeat prompt caching on every request.
   */
  private get hardenedSystemPrompt(): string {
    this.cachedSystemPrompt ??= [this.systemPrompt, ...UNTRUSTED_INPUT_RULES].join(' ');
    return this.cachedSystemPrompt;
  }

  private cachedSystemPrompt?: string;

  private buildMessages(userPrompt: string): LlmMessage[] {
    return [{ role: 'user', content: userPrompt }];
  }

  /**
   * The generate-or-fall-back template every artifact agent follows: ask the
   * model, accept the answer if it validates, otherwise build deterministically —
   * and **stamp how it went** onto the artifact.
   *
   * It lives here rather than in each agent because the eight artifact agents had
   * byte-for-byte the same try/validate/catch/fallback shape, and provenance that
   * each one stamps by hand is provenance the ninth agent forgets. A new agent
   * calling this gets an accurate stamp for free.
   *
   * The mode reflects **what the agent did with the output**, not merely whether
   * the HTTP call succeeded: a 200 carrying JSON that fails `isValid` is a
   * fallback, because the artifact the user receives was built by the code.
   * Whether that counts as *degraded* is a separate, presentation-time question
   * (`isDegradedGeneration` also treats the mock provider as degraded).
   */
  protected async generateArtifact<T extends { generation?: GenerationProvenance }>(
    spec: {
      /** Human-readable artifact name, used only in log lines. */
      label: string;
      prompt: string;
      isValid: (raw: Partial<T>) => boolean;
      /** Build the artifact from accepted model output. */
      accept: (raw: Partial<T>) => T;
      /** Build the artifact without the model. */
      fallback: () => T;
      options?: LlmCompleteOptions;
    },
  ): Promise<T> {
    const logger = this.logger;
    let reason: DegradedReason = 'invalid_output';

    try {
      const raw = await this.askWithinBudget<T>(spec.prompt, spec.options);
      if (spec.isValid(raw)) {
        return this.stamp(spec.accept(raw), { mode: 'llm' });
      }
      logger.debug(`${spec.label} malformed; using deterministic build.`);
    } catch (err) {
      reason = degradedReasonFor(err);
      logger.warn(`${spec.label} failed (${reason}); using fallback: ${err}`);
    }
    return this.stamp(spec.fallback(), { mode: 'fallback', degradedReason: reason });
  }

  /**
   * Ask the model, and if the request is refused for exceeding the caller's rate
   * tier, ask again for less.
   *
   * A provider counts `max_tokens` toward tokens-per-minute, so an output budget
   * sized for the artifact can be rejected **before the model runs** on a small
   * free tier — and no amount of waiting fixes it, because the request breaches
   * the ceiling on its own. Halving the budget is the only move that turns a
   * guaranteed failure into a possible success, and a slightly shorter artifact
   * beats the deterministic template the agent would otherwise fall back to.
   *
   * One retry, not a loop: if half the budget still doesn't fit, the tier is too
   * small for this artifact and the honest outcome is the fallback plus a warning
   * naming the real limit — not four more billed attempts walking the number down.
   */
  private async askWithinBudget<T>(
    prompt: string,
    options?: LlmCompleteOptions,
  ): Promise<Partial<T>> {
    try {
      return await this.thinkJson<Partial<T>>(prompt, options);
    } catch (err) {
      const budget = options?.maxTokens;
      if (!budget || !isRequestTooLarge(err)) throw err;

      const reduced = Math.floor(budget / 2);
      this.logger.warn(
        `Request exceeded the provider's per-minute limit at maxTokens=${budget}; ` +
          `retrying once at ${reduced}. If this recurs, the model's TPM is too low ` +
          `for this artifact — switch model or tier rather than raising the budget.`,
      );
      return this.thinkJson<Partial<T>>(prompt, { ...options, maxTokens: reduced });
    }
  }

  /**
   * Build a provenance stamp for the active provider.
   *
   * Exposed for the agents whose flow does not fit `generateArtifact` — the API
   * designer chunks its calls and has several success paths — so they stamp the
   * same shape rather than hand-rolling one that drifts.
   */
  protected provenance(
    mode: GenerationProvenance['mode'],
    degradedReason?: DegradedReason,
  ): GenerationProvenance {
    return {
      mode,
      provider: this.llm.name,
      model: this.llm.defaultModel,
      ...(degradedReason ? { degradedReason } : {}),
    };
  }

  /**
   * Attach provenance to a freshly generated artifact.
   *
   * This is authoritative: it **replaces** any `generation` the artifact already
   * carried, because a (re)generation is exactly the event that makes an older
   * stamp wrong. The other direction — a human edit, which must *keep* the
   * existing stamp — is `preserveGeneration` in `@archivato/shared`.
   */
  private stamp<T extends { generation?: GenerationProvenance }>(
    artifact: T,
    provenance: Pick<GenerationProvenance, 'mode' | 'degradedReason'>,
  ): T {
    return {
      ...artifact,
      generation: this.provenance(provenance.mode, provenance.degradedReason),
    };
  }

  /**
   * The agent's logger, named for the concrete subclass.
   *
   * Lives here so a subclass needs no logger field of its own — eight agents
   * previously declared one and, once they moved onto `generateArtifact`, kept
   * it with zero readers (ESLint does not flag unused private members, so
   * nothing would ever have caught it).
   */
  protected get logger(): Logger {
    this.cachedLogger ??= new Logger(this.constructor.name);
    return this.cachedLogger;
  }

  private cachedLogger?: Logger;
}

/**
 * Map a thrown failure onto the reason a user can act on.
 *
 * `parse_error` is called out separately from `call_failed` because it is the
 * expensive one: the model call **succeeded and was billed**, and only the JSON
 * was unusable — so it points at the prompt or the model, not the network.
 */
export function degradedReasonFor(err: unknown): DegradedReason {
  if (err instanceof LlmJsonParseError) return 'parse_error';
  // A provider rejecting its OWN model's malformed JSON (Groq's 400
  // `json_validate_failed`) is the same event as a local parse failure: the call
  // was made and billed, and only the output was unusable. It arrives as an HTTP
  // error, so without this it would read as `call_failed` and send the reader
  // looking at the network instead of at the token budget.
  if (isGenerationFailure(err)) return 'parse_error';
  // `kind` rather than a regex over `err.message`: that message is prose built in
  // llm-http.ts, and rewording it would silently reclassify every timeout.
  if (err instanceof LlmHttpError) {
    return err.kind === 'timeout' ? 'timeout' : 'call_failed';
  }
  return 'call_failed';
}
