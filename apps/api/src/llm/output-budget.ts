/**
 * The output budget every provider falls back to when an agent names none.
 *
 * **This number is the fix for a bug that shipped four times.** It was 2048 —
 * copied independently into the Groq, Azure, Cerebras and SiliconFlow providers
 * — and "an agent that passes no `options`" therefore meant "an agent capped at
 * 2048", silently. Four artifacts outgrew it and were cut off mid-JSON: the
 * database schema (relations dropped), the review, the system design, and the
 * requirement document.
 *
 * Truncation is invisible here by construction, which is why it kept recurring:
 *
 *   - `parseJsonFromLlm` falls back to "the widest balanced slice", so a cut-off
 *     response **parses cleanly** into a partial object instead of throwing;
 *   - the keys that vanish are whichever the schema lists **last**;
 *   - so an agent whose `isValid` checks a late field falls back to its template
 *     (a billed call, thrown away), and one whose `isValid` checks only early
 *     fields **persists the truncated artifact** — the quieter, worse outcome.
 *
 * 4096 is what the Claude provider always used, and Claude is the one provider
 * that never produced this bug. It is a floor, not a ceiling: an artifact whose
 * size is genuinely unbounded still names its own budget (`SCHEMA_MAX_TOKENS`,
 * `REVIEW_MAX_TOKENS`, `DESIGN_MAX_TOKENS`, `CHUNK_MAX_TOKENS`, all 4096-5120).
 * What changed is that forgetting is no longer a trap.
 *
 * **Raising this is not free — check the target model's TPM first.** Providers
 * reserve `max_tokens` against tokens-per-minute, so a large budget on a small
 * prompt can be refused *before the model runs* (a 413) on a free tier. That is
 * the ceiling this sits under, and it is why the default is 4096 rather than
 * simply matching the largest per-agent constant: it is reserved on **every**
 * call, including one-question interview turns. `BaseAgent.askWithinBudget`
 * halves the budget once on a size refusal, which is the safety net — not a
 * licence to raise this.
 *
 * Lives in one file so the four providers cannot drift apart again.
 */
export const DEFAULT_MAX_TOKENS = 4096;
