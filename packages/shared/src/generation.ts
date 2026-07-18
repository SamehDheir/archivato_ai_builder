/**
 * Generation provenance — how an artifact actually came to exist.
 *
 * Every LLM-driven agent has a deterministic fallback, which is what makes the
 * pipeline resilient: a bad or absent model still yields a valid artifact. The
 * cost of that design is that **degradation is invisible**. A Pro user paid for
 * an LLM-generated API design, one transient failure dropped the agent onto its
 * template, and nothing in the document said so — they then sent it to a client.
 *
 * This stamp is the honesty fix. It records what produced the artifact so the UI
 * can say "this is a template, regenerate" instead of presenting it as AI work.
 *
 * Runtime-free and stored inside the artifact's `data Json` blob, so adding it is
 * migration-free (the JSON-artifact convention).
 */

/** Whether the model's output was accepted, or the code built the artifact. */
export type GenerationMode = 'llm' | 'fallback';

/** Why a generation fell back. Absent on the `llm` path. */
export type DegradedReason =
  /** No provider configured — the offline/mock path. */
  | 'no_provider'
  /** The provider call failed (HTTP error, network fault). */
  | 'call_failed'
  /** The provider call exceeded its time budget. */
  | 'timeout'
  /** The model answered, but not with parseable JSON. */
  | 'parse_error'
  /** The model answered with JSON that failed the agent's validity check. */
  | 'invalid_output';

export const DEGRADED_REASONS: readonly DegradedReason[] = [
  'no_provider',
  'call_failed',
  'timeout',
  'parse_error',
  'invalid_output',
];

export interface GenerationProvenance {
  mode: GenerationMode;
  /** The resolved provider id, e.g. "groq" | "claude" | "azure" | "mock". */
  provider: string;
  /**
   * The **configured** model the provider was asked for — not necessarily the
   * model id a bill would name. On Azure the provider selects by *deployment*,
   * so this holds the deployment name (an operator-chosen string like
   * `prod-chat`), because that is the identifier an operator can act on when
   * they see a degraded artifact.
   *
   * The LLM usage meter deliberately records something different: it prices off
   * the model the API **echoes back** (`data.model`), since only that can be
   * matched against `MODEL_PRICING`. The two fields answer different questions —
   * "what did we configure" vs "what were we billed for" — so do not try to make
   * one serve the other.
   */
  model: string;
  /** Present only when `mode` is `fallback`. */
  degradedReason?: DegradedReason;
}

/**
 * Does this artifact deserve a "not real AI output" warning?
 *
 * Two independent ways to be degraded, and the second is the subtle one:
 *  - the agent fell back (`mode: 'fallback'`), or
 *  - the run was on the **mock** provider, where the agent may well have
 *    "succeeded" — `MockLlmProvider` returns parseable JSON, so a scripted
 *    response can pass `isValid` and take the `llm` path. That artifact is still
 *    not AI output, and calling it one would be the exact dishonesty this stamp
 *    exists to prevent.
 *
 * **Absent provenance is NOT degraded.** Rows written before this existed carry
 * no stamp and we cannot know how they were built; warning on a guess would nag
 * every old project to re-run a billed, Pro, LLM stage. Same rule as an
 * unstamped `sourceStamp` never being stale.
 */
export function isDegradedGeneration(
  generation: GenerationProvenance | undefined,
): boolean {
  if (!generation) return false;
  return generation.mode === 'fallback' || generation.provider === 'mock';
}

/**
 * The reason to show for a degraded artifact.
 *
 * A mock-provider run reports `no_provider` regardless of which branch it took,
 * because "the model returned something we accepted" is meaningless when the
 * model was a stub — and `no_provider` is the one a reader can act on (configure
 * a key, regenerate).
 */
export function degradedReasonOf(
  generation: GenerationProvenance | undefined,
): DegradedReason | null {
  if (!isDegradedGeneration(generation) || !generation) return null;
  if (generation.provider === 'mock') return 'no_provider';
  return generation.degradedReason ?? 'call_failed';
}

/**
 * Carry an existing artifact's provenance onto an edited copy of it.
 *
 * **The rule this encodes: `generation` describes how the artifact's CONTENT was
 * produced, so a human edit preserves it and only a (re)generation replaces it.**
 * Editing one sentence of a document the model never wrote does not make it
 * AI-written, so the warning has to survive the edit — and a regenerate has to
 * clear it, which it does by stamping afresh.
 *
 * It exists as a helper rather than a line in each `save()` because there are
 * four structured editors plus the R11 fix writers, and provenance that every
 * write path re-implements is provenance the fifth one forgets. That already
 * happened once: `save()` dropped the stamp (the global `ValidationPipe` runs
 * `whitelist: true`, so the client's payload never carries it) while
 * `appendOutOfScope` spread it through — the same field, two behaviours, one
 * file apart.
 *
 * Taking it from `existing` rather than `edited` also closes the forgery path:
 * whatever a client sends is overwritten by what the server last recorded.
 */
export function preserveGeneration<T extends { generation?: GenerationProvenance }>(
  edited: T,
  existing: { generation?: GenerationProvenance } | null | undefined,
): T {
  if (!existing?.generation) return withoutGeneration(edited);
  return { ...edited, generation: existing.generation };
}

/**
 * Drop the provenance stamp from an artifact leaving for the public share page.
 *
 * **Provenance is OWNER-ONLY.** It is a quality signal for the person who
 * generated the document — "this one is a template, regenerate it" — and it is
 * actively harmful in front of the client the document was written for: it tells
 * them their vendor's proposal was machine-templated, and it names our provider
 * and model, which is our infrastructure, not theirs. The owner decides whether
 * to regenerate; the client should never have been in that conversation.
 *
 * Same enforcement as R9's `budgetWarning` and R10/R11's deal-risk fields — the
 * payload IS the boundary, so this runs server-side in `ShareService.view`.
 */
export function withoutGeneration<T extends { generation?: GenerationProvenance }>(
  artifact: T,
): T {
  if (!artifact.generation) return artifact;
  const { generation: _redacted, ...rest } = artifact;
  return rest as T;
}
