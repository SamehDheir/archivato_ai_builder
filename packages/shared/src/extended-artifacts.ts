/**
 * **Extended artifacts (R12)** — whether a project generates the threat model and
 * the QA plan. Pure and runtime-free, so the API derives the default with it and
 * the web renders the toggle from the same rule.
 *
 * Why this exists: both stages are **Pro, LLM-billed, and slow**, and they are the
 * two a small fixed-price job least often needs. Offering them by default on a
 * $4k build makes the tool feel heavier than the deal — the owner pays tokens and
 * waits, to produce a STRIDE analysis nobody in that engagement will read.
 *
 * Two rules hold it together:
 *
 * 1. **Unknown means yes.** The default flips to `false` only when the budget
 *    *parses* and is genuinely small. A missing, unparseable, or n/a budget keeps
 *    both stages on — the same "null, never a guess" rule `parseBudget` itself
 *    follows. Silently withholding a security analysis because we failed to read
 *    a sentence would be the worst outcome here, and it would be invisible.
 *
 * 2. **The threshold is a suggestion, not a gate.** This only picks what the
 *    toggle at the confirmation gate starts on. The owner sees it and decides;
 *    nothing here can refuse to generate an artifact they asked for.
 */

import { parseBudget } from './effort';
import type { SlotMap } from './interview';

/**
 * Stated budgets at or below this (USD) default the threat model + QA plan OFF.
 *
 * Editable in exactly one place, by design. $10k is roughly where a MENA dev
 * shop's fixed-price job starts carrying a real security review as a line item —
 * below it the work is usually a small build where the client is paying for
 * features, not assurance. It is a starting position, not a policy: every project
 * shows the toggle.
 */
export const EXTENDED_ARTIFACTS_BUDGET_THRESHOLD = 10_000;

/**
 * Whether a NEW project should default to generating the threat model + QA plan.
 *
 * Reads the top of the stated range: a "5,000–12,000" budget is a project that
 * *can* stretch to the assurance work, so it defaults on. Only a budget whose
 * ceiling is at or under the threshold defaults off.
 */
export function defaultExtendedArtifacts(
  slots: SlotMap | null | undefined,
): boolean {
  const slot = slots?.budget_range;
  // `na` means the model judged the slot irrelevant for this project — that is not
  // a statement that the budget is small.
  if (!slot || slot.na) return true;
  const budget = parseBudget(slot.value);
  if (!budget) return true;
  return budget.max > EXTENDED_ARTIFACTS_BUDGET_THRESHOLD;
}
