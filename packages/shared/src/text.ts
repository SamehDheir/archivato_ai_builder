/**
 * Small, runtime-free text helpers shared across agents.
 */

/**
 * Distinct lower-cased "content" words of length ≥ 4 — a cheap keyword set for
 * fuzzy relatedness checks (which requirements a module touches, whether a refine
 * brought an out-of-scope item into scope). Pass `stopWords` to drop generic
 * filler ("user", "system", …) that would otherwise over-match.
 */
export function significantTokens(
  text: string,
  stopWords?: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !stopWords?.has(token)),
    ),
  ];
}
