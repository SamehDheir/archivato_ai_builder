/**
 * Small, pure list helpers shared by the API and the web.
 *
 * `dedupeBy` exists because of a duplication bug that surfaced identically on
 * several artifact pages at once — the System Design "Services" list rendered
 * five times over, the Vision "MVP" / "Success metrics" sections twice each. The
 * views were innocent: each maps its array exactly once. The arrays themselves
 * carried duplicate entries, and **nothing anywhere de-duplicated them** — an
 * artifact is generated (an LLM will happily list `AuthService` twice), stored
 * as JSON, and served back verbatim, so a repeat in the data is a repeat on the
 * page, on every page, with no single append site to blame.
 *
 * The safeguard is therefore a shared one, applied both where the artifact is
 * built (so new data is clean, and exports/share inherit it) and again just
 * before a list is rendered (so a row already stored with duplicates heals on
 * read without a migration). Stable and order-preserving: the FIRST occurrence
 * of each key wins, so de-duping never reorders a list the model deliberately
 * ordered.
 */

/**
 * Return the items with duplicates removed, keyed by `key`.
 *
 * `key` should be a STABLE identity for the item — a name, an id, a composite of
 * the fields that make two entries "the same thing". A blank/whitespace key
 * collapses to `''`, so several unnamed entries would fold into one; that is the
 * right call for a rendered list (two blank cards are noise) and callers that
 * need to keep blanks should key on the index instead.
 */
export function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Dedupe a list of plain strings, trimming and case-folding for the identity. */
export function dedupeStrings(items: readonly string[]): string[] {
  return dedupeBy(items, (s) => s);
}
