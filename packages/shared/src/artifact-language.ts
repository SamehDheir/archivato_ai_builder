/**
 * Artifact language — what language the *generated content* of a project is in.
 *
 * This is a different question from the UI locale, and conflating the two is what
 * produced the broken pages this module exists to prevent. The UI locale is a
 * per-viewer preference that flips instantly; an artifact is generated **once**,
 * persisted as JSON, and then read by people who are not the owner (the public
 * share page has no toggle and no session). So the language an artifact is
 * written in belongs to the **project**, and it is stamped onto the artifact
 * itself so every downstream boundary can read it without a session lookup.
 *
 * Three rules hold the whole system together:
 *
 * 1. **Static UI chrome** (labels, headers, buttons, badges) is always translated
 *    by the web's i18n system, in the viewer's locale. Not this module's problem.
 * 2. **Generated prose** (rationales, summaries, assessments, business rules) is
 *    written in THIS language, by the model, on the first pass — never translated
 *    afterwards, and never assembled from pieces in two languages.
 * 3. **Code-facing identifiers** (table and column names, API paths, enum values,
 *    requirement ids, technology names) stay English at every language, because
 *    they are code. `CODE_FACING_RULE` is the clause that says so to the model.
 *
 * Runtime-free, so it is importable from the browser, the API, and the agents.
 */

/**
 * The languages a project's artifacts can be generated in.
 *
 * **Adding one here is deliberately a breaking change.** Every localized string
 * table in this package is typed `Record<ArtifactLanguage, …>`, so extending the
 * union turns every table with a missing entry into a **compile error** rather
 * than a silent English fallback at runtime. That is the mechanism that keeps a
 * new locale from shipping half-translated — which is exactly how the
 * partially-translated pages happened in the first place.
 */
export type ArtifactLanguage = 'en' | 'ar';

export const ARTIFACT_LANGUAGES: readonly ArtifactLanguage[] = ['en', 'ar'];

/**
 * The language used when nothing else is known.
 *
 * English rather than "whatever the viewer prefers": an unstamped artifact was
 * written before this system existed, and those are English. Guessing the
 * viewer's locale would relabel a genuinely English document as Arabic and send
 * a reader looking for translation that was never there.
 */
export const DEFAULT_ARTIFACT_LANGUAGE: ArtifactLanguage = 'en';

export function isArtifactLanguage(value: unknown): value is ArtifactLanguage {
  return (
    typeof value === 'string' &&
    (ARTIFACT_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Coerce anything (a DB column, a DTO field, a UI locale string) to a language.
 *
 * Unrecognized input resolves to the default rather than throwing — the column is
 * nullable, old rows carry nothing, and a locale like `ar-EG` should still read
 * as Arabic. It matches on the **base subtag** so regional variants work, but it
 * never guesses beyond that (the `parseBudget` "null, never a guess" instinct,
 * softened only because there is a safe default here and no number to invent).
 */
export function toArtifactLanguage(value: unknown): ArtifactLanguage {
  if (isArtifactLanguage(value)) return value;
  if (typeof value === 'string') {
    const base = value.toLowerCase().split(/[-_]/)[0];
    if (isArtifactLanguage(base)) return base;
  }
  return DEFAULT_ARTIFACT_LANGUAGE;
}

/** Arabic script blocks (base + supplement + presentation forms). */
const ARABIC_SCRIPT =
  /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

/**
 * Detect the language a person is writing in, from their own words.
 *
 * Returns `'ar'` when a meaningful share of the letters are Arabic, so a mostly
 * Arabic idea carrying a few English tech terms ("نظام إدارة مكتبة على React")
 * still reads as Arabic. Empty or non-Arabic text is English.
 *
 * This is the **default** for a project's artifact language: the client described
 * their business in some language, and a scoping document they are meant to read
 * should come back in it. The owner can still override — a MENA dev shop does
 * sometimes bid an Arabic-described project to an English-reading stakeholder.
 *
 * Lives here rather than in the API's interview module because both the artifact
 * language and the interview language are now the same decision, and two copies
 * of this threshold would eventually disagree about the same project.
 */
export function detectArtifactLanguage(text: string): ArtifactLanguage {
  if (!text) return DEFAULT_ARTIFACT_LANGUAGE;
  const arabic = (text.match(ARABIC_SCRIPT) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return DEFAULT_ARTIFACT_LANGUAGE;
  return arabic / letters >= 0.3 ? 'ar' : 'en';
}

/**
 * An artifact that records the language its prose was generated in.
 *
 * Stamped by the agent at generation time and stored inside the artifact's
 * `data Json` blob, so adding it is migration-free (the JSON-artifact
 * convention) and every reader — the normalizers at both repository boundaries,
 * the exporters, the share projection, the web views — can resolve the language
 * without loading the session.
 *
 * Unlike `generation`, this is **not** stripped for the share page: it says what
 * language the document is in, which the client reading it can already see, and
 * the public page needs it to set text direction correctly.
 */
export interface LocalizedArtifact {
  /** Absent on artifacts written before this existed; those are English. */
  language?: ArtifactLanguage;
}

/**
 * The language an artifact's prose is in.
 *
 * An unstamped artifact reads as English — see `DEFAULT_ARTIFACT_LANGUAGE`. This
 * is the accessor every consumer should use rather than reading `.language`
 * directly, so the "absent means English" rule lives in exactly one place.
 */
export function artifactLanguageOf(
  artifact: LocalizedArtifact | null | undefined,
): ArtifactLanguage {
  return toArtifactLanguage(artifact?.language);
}

/**
 * The HTML `dir` an artifact's prose should render with.
 *
 * Artifact text is rendered inside a UI that may be in the *other* direction (an
 * English document on an Arabic page, or the reverse), so the container needs an
 * explicit direction rather than inheriting the page's. `dir="auto"` is not
 * enough on its own: it keys off the first strong character, so a paragraph that
 * opens with a technology name ("PostgreSQL کان الخيار…") is laid out backwards.
 */
export function artifactTextDirection(
  language: ArtifactLanguage,
): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/**
 * A string table that must cover every language.
 *
 * The point of the type is the **compile error**: `Record` requires every key, so
 * a table that forgets a language cannot be built, and adding a language to
 * `ArtifactLanguage` fails the build at every table that has not been translated.
 * Deterministic prose is therefore never half-localized — the failure mode is a
 * red build, not a sentence that reads half in each language.
 */
export type LocalizedCopy<T> = Record<ArtifactLanguage, T>;

/**
 * Pick a language's entry out of a string table.
 *
 * A one-line indexing helper, but it exists so call sites read as a lookup rather
 * than as an index expression, and so the `LocalizedCopy` contract is named at
 * every use.
 */
export function copyFor<T>(
  table: LocalizedCopy<T>,
  language: ArtifactLanguage,
): T {
  return table[language];
}

/**
 * The endonym for each language, for a UI that offers the choice.
 *
 * A language picker lists each option **in its own language** — a reader who
 * wants Arabic finds "العربية", not the English word "Arabic" they may not read.
 * So this is deliberately not run through i18n.
 */
export const ARTIFACT_LANGUAGE_NAMES: LocalizedCopy<string> = {
  en: 'English',
  ar: 'العربية',
};

/**
 * What a model must keep in English no matter what language it is writing in.
 *
 * This is the clause that preserves the one behaviour that was already correct:
 * a database schema is **code**, so `books`, `borrower_id` and `/api/borrowings`
 * stay exactly as they are while the chrome around them is translated. Without
 * it, a model told to "write in Arabic" will happily return a table named
 * `الكتب`, and the generated SQL, Prisma schema and scaffold stop compiling.
 *
 * Kept as one exported constant, embedded verbatim in the language rules below,
 * so the carve-out cannot drift between the languages that need it.
 */
export const CODE_FACING_RULE =
  'Identifiers that are CODE always stay in English, in every language, exactly ' +
  'as they would be typed: database table and column names, SQL types, API ' +
  'paths and HTTP methods, JSON field names, enum values, environment ' +
  'variables, file paths, technology and product names (PostgreSQL, NestJS, ' +
  'Stripe), and artifact ids (FR-1, NFR-2, TC-3). Translate the prose ABOUT ' +
  'them, never the identifiers themselves.';

/**
 * The output-language instruction appended to every agent's system prompt.
 *
 * **This is the fix for the whole class of bug.** Before it, only two of fifteen
 * agents were told what language to write in — the interviewer and the proposal
 * writer — and the other thirteen were handed an Arabic transcript with no
 * instruction at all. A model in that position picks a language *per field*: one
 * real run returned an Arabic competitor name and an English architecture
 * rationale from the same pipeline, which is why the page looked half-translated.
 * Nothing was translating anything; nothing was *deciding* anything either.
 *
 * It is applied in `BaseAgent`, not written into each agent's persona, for the
 * same reason `UNTRUSTED_INPUT_RULES` is: a rule fifteen agents state by hand is
 * a rule the sixteenth forgets. A new agent is localized before it is written.
 *
 * The Arabic entry pins **Modern Standard Arabic** explicitly. Left to itself a
 * model mirrors the register of its input, and an interview conducted in
 * Levantine dialect produced a client-facing document in Levantine dialect —
 * which reads as unprofessional to a Gulf or North African client and is the
 * wrong register for a document someone signs. MSA is the one variety that
 * travels across every Arabic-speaking market.
 */
export const OUTPUT_LANGUAGE_RULES: LocalizedCopy<readonly string[]> = {
  en: [
    'Write ALL prose you generate in English.',
    CODE_FACING_RULE,
  ],
  ar: [
    'Write ALL prose you generate in Arabic (العربية) — every sentence a person ' +
      'reads: summaries, rationales, descriptions, titles, findings, ' +
      'recommendations, assumptions and questions. The reader is an Arabic-' +
      'speaking client and their contractor, and a document that is half English ' +
      'is unusable to both.',
    'Use Modern Standard Arabic (الفصحى) — formal written Arabic suitable for a ' +
      'business document. Never use a regional spoken dialect (Levantine, Gulf, ' +
      'Egyptian, Maghrebi), even if the input you were given uses one.',
    CODE_FACING_RULE,
    'Keep every JSON key, enum value and structural token from the requested ' +
      'schema in English exactly as specified — translate only the values that ' +
      'are prose.',
  ],
};

/**
 * The language clause for a system prompt, as one string.
 *
 * Joined here rather than at the call site so the separator is identical for
 * every agent — `ClaudeLlmProvider` marks the system prompt with `cache_control`,
 * and a prompt that differs by whitespace between agents is a prompt that never
 * gets a cache hit.
 */
export function outputLanguageRules(language: ArtifactLanguage): string {
  return copyFor(OUTPUT_LANGUAGE_RULES, language).join(' ');
}
