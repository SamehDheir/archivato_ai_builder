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

/**
 * Singularize an English noun for **prose matching** — `categories` → `category`,
 * `addresses` → `address`, `patients` → `patient`.
 *
 * Handles the two plural forms a bare "strip the trailing s" rule mangles:
 * `-ies` → `-y`, and a sibilant `-es` → base (`statuses` → `status`, `boxes` →
 * `box`). A naive strip turns `addresses` into `addresse` and `statuses` into
 * `statuse` — tokens that appear in no sentence — so every match against them
 * silently fails closed.
 *
 * Deliberately not a full inflector. A conservative rule that never mangles a
 * word beats a clever one that sometimes does, because both callers use it to
 * decide whether two nouns are the same noun, and a mangled stem can only ever
 * produce a miss.
 */
export function singularNoun(noun: string): string {
  if (/[^aeiou]ies$/i.test(noun)) return `${noun.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z|s)es$/i.test(noun)) return noun.slice(0, -2);
  return noun.endsWith('s') ? noun.slice(0, -1) : noun;
}
