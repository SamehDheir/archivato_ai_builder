import { Logger } from '@nestjs/common';
import type {
  AgentRole,
  ArtifactLanguage,
  DegradedReason,
  GenerationProvenance,
  LocalizedArtifact,
} from '@archivato/shared';
import { outputLanguageRules, UNTRUSTED_INPUT_RULES } from '@archivato/shared';
import { currentArtifactLanguage } from './usage/llm-usage.context';
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
      system: await this.hardenedSystemPrompt(),
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
      system: await this.hardenedSystemPrompt(),
      ...options,
      agent: this.role,
    });
  }

  /**
   * The language this agent must write its prose in.
   *
   * Read ambiently from the LLM call context (established by the HTTP
   * interceptor and the BullMQ worker) rather than passed down through the
   * fifteen agent context types, for the reason that context exists: threading a
   * field through a dozen stage services is the wide invasive change the seam
   * was built to avoid.
   *
   * Exposed to subclasses because a **deterministic fallback** needs it too. The
   * model is only half the story: an agent that falls back offline still emits a
   * document, and a fallback that is always English would put an English section
   * inside an otherwise Arabic package — the same broken half-translated page,
   * arriving exactly when generation had already degraded.
   */
  protected artifactLanguage(): Promise<ArtifactLanguage> {
    return currentArtifactLanguage();
  }

  /**
   * The agent's persona with the standing rules appended — the untrusted-input
   * hierarchy that gives `untrusted()`'s fence its meaning, and the output
   * language the artifact must be written in.
   *
   * Both are applied **here** rather than written into each agent's
   * `systemPrompt` for the reason `generateArtifact` exists: fifteen agents
   * interpolate client text, and a rule each one states by hand is a rule the
   * sixteenth forgets. This way a new agent is defended, and localized, before
   * it is written.
   *
   * The language rule matters most because its absence was **silent**. Only the
   * interviewer and the proposal writer were ever told what language to answer
   * in; the other thirteen were handed an Arabic transcript with no instruction,
   * and a model in that position picks a language per field — one real run
   * returned an Arabic competitor name and an English architecture rationale from
   * the same pipeline. Nothing errored, and every stage was confidently
   * inconsistent in the same way.
   *
   * Cached **per language** because the string must be *stable* across calls, not
   * merely equal: `ClaudeLlmProvider` marks the system prompt with
   * `cache_control`, and a freshly built prompt per call would defeat prompt
   * caching on every request. Keying the cache by language keeps that property —
   * an agent used in both languages holds two stable strings, not one that
   * churns.
   */
  private async hardenedSystemPrompt(): Promise<string> {
    const language = await this.artifactLanguage();
    let cached = this.cachedSystemPrompts.get(language);
    if (!cached) {
      cached = [
        this.systemPrompt,
        ...UNTRUSTED_INPUT_RULES,
        outputLanguageRules(language),
      ].join(' ');
      this.cachedSystemPrompts.set(language, cached);
    }
    return cached;
  }

  private readonly cachedSystemPrompts = new Map<ArtifactLanguage, string>();

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
  protected async generateArtifact<
    T extends { generation?: GenerationProvenance } & LocalizedArtifact,
  >(
    spec: {
      /** Human-readable artifact name, used only in log lines. */
      label: string;
      prompt: string;
      isValid: (raw: Partial<T>) => boolean;
      /**
       * Build the artifact from accepted model output.
       *
       * Receives the language so the agent can stamp it onto the artifact and
       * localize any sentence the *code* composes around the model's values —
       * the class of bug where an English template wrapped an Arabic value and
       * produced a sentence that read as neither language.
       */
      accept: (raw: Partial<T>, language: ArtifactLanguage) => T;
      /** Build the artifact without the model, in the project's language. */
      fallback: (language: ArtifactLanguage) => T;
      options?: LlmCompleteOptions;
    },
  ): Promise<T> {
    const logger = this.logger;
    let reason: DegradedReason = 'invalid_output';
    // Resolved once, before the call, so both branches below agree — and so a
    // fallback triggered by a *failed* call still knows the language, which a
    // resolution deferred until the catch block could not guarantee.
    const language = await this.artifactLanguage();

    try {
      const raw = await this.askWithinBudget<T>(spec.prompt, spec.options);
      if (spec.isValid(raw)) {
        return this.stamp(spec.accept(raw, language), { mode: 'llm' }, language);
      }
      // Name what came back. A bare "malformed" says a billed call was thrown
      // away and nothing about why — diagnosing one real case (a review
      // truncated at the provider's default 2048, salvaged by
      // `parseJsonFromLlm` into a partial object missing its LAST key) needed a
      // query against `llm_usage` to see `completionTokens` pinned to the cap.
      // The key list alone would have said it: a truncated artifact is missing
      // the tail of the schema, a mis-shaped one has the wrong names.
      //
      // Keys only, never values: this object is built from the client's own
      // words, and the log pipeline is not where that belongs.
      logger.debug(
        `${spec.label} malformed; using deterministic build. Model returned: ${describeShape(raw)}`,
      );
    } catch (err) {
      reason = degradedReasonFor(err);
      logger.warn(`${spec.label} failed (${reason}); using fallback: ${err}`);
    }
    return this.stamp(
      spec.fallback(language),
      { mode: 'fallback', degradedReason: reason },
      language,
    );
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
  private stamp<T extends { generation?: GenerationProvenance } & LocalizedArtifact>(
    artifact: T,
    provenance: Pick<GenerationProvenance, 'mode' | 'degradedReason'>,
    language: ArtifactLanguage,
  ): T {
    return {
      ...artifact,
      generation: this.provenance(provenance.mode, provenance.degradedReason),
      // The language rides *on the artifact*, not just in the session, because
      // every reader downstream needs it and most of them have no session to ask:
      // the normalizers at both repository boundaries, the exporters, the share
      // projection, and the web views that must set text direction. Stamping it
      // here means one write path covers all of them.
      //
      // Unlike `generation`, it is NOT stripped for the share page — it states
      // what language the document is in, which its reader can already see, and
      // the public page needs it to lay the text out correctly.
      language,
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
 * The top-level shape of a rejected model response, for the log line only.
 *
 * Keys, never values — the response is derived from the client's own words and
 * a log pipeline has a different access model than the artifact does (the same
 * rule that keeps prompt/completion content out of `llm_usage`).
 */
export function describeShape(raw: unknown): string {
  if (raw === null || raw === undefined) return String(raw);
  if (Array.isArray(raw)) return `array(${raw.length})`;
  if (typeof raw !== 'object') return typeof raw;
  const keys = Object.keys(raw as Record<string, unknown>);
  return keys.length ? `{ ${keys.join(', ')} }` : '{} (no keys)';
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
