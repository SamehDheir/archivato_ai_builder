#!/usr/bin/env node
/**
 * i18n integrity check — catches the class of bug where a translation key is
 * missing and the UI silently renders the raw key name.
 *
 * This exists because of a real leak: the breadcrumb rendered the literal string
 * `tab.business`. The cause was not a typo but **drift between two copies of the
 * same key set** — `dashboard.json` carried its own `tab` block so the breadcrumb
 * could read labels, and when three tabs were added later only `project.json`
 * got them. i18next's failure mode makes that invisible: a missing key falls back
 * to the key itself, in every locale, so it looks like a rendering glitch rather
 * than a missing translation, and it never throws.
 *
 * Two checks, because they fail for different reasons:
 *
 *  1. **Parity** — every key present in the reference locale must exist in every
 *     other locale, and vice versa. A key only in `en` renders as English on the
 *     Arabic page (the `fallbackLng` leak); a key only in `ar` is dead weight
 *     that usually marks a rename half-applied.
 *
 *  2. **Resolvability** — every *statically literal* `t('…')` call in the source
 *     must resolve against the namespace it is called with. This is the check
 *     that would have caught `tab.business` at build time.
 *
 * Deliberately conservative about what it flags. Template keys (`t(\`tab.${x}\`)`)
 * are skipped rather than guessed at — the codebase builds keys dynamically in
 * several places, and a checker that cried wolf on those would be muted, which is
 * worse than one that quietly covers less. Parity, which needs no source
 * analysis, is what covers those dynamic keys instead: `tab.business` is caught
 * because `project.json` and `ar/project.json` are compared key for key.
 *
 * Exit code 1 on any problem, so CI fails.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(webRoot, 'locales');

/** The locale every other locale is compared against. */
const REFERENCE = 'en';

/**
 * i18next plural suffixes. A key called with `count` legitimately exists as
 * `key_one` / `key_other` in English and as the full CLDR set
 * (`_zero/_one/_two/_few/_many/_other`) in Arabic — so those forms must NOT be
 * compared for parity. Arabic genuinely needs six where English needs two, and
 * flagging that would be flagging correct code.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const localeNames = readdirSync(localesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

/** Flatten a nested resource object to dotted leaf keys. */
function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    // An array leaf (the legal pages use `returnObjects`) is a value, not a
    // branch — recursing into it would compare list *lengths* as if they were
    // keys, and a translation is allowed to have a different number of bullets.
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.set(path, child);
    }
  }
  return out;
}

/** `locale -> namespace -> Map<key, value>` */
const resources = new Map();
for (const locale of localeNames) {
  const namespaces = new Map();
  for (const file of readdirSync(join(localesDir, locale))) {
    if (!file.endsWith('.json')) continue;
    const full = join(localesDir, locale, file);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      console.error(`✗ ${relative(webRoot, full)} is not valid JSON: ${err.message}`);
      process.exit(1);
    }
    namespaces.set(file.replace(/\.json$/, ''), flatten(parsed));
  }
  resources.set(locale, namespaces);
}

const problems = [];

// ── 1. Key parity across locales ─────────────────────────────────────────────
const reference = resources.get(REFERENCE);
if (!reference) {
  console.error(`✗ No "${REFERENCE}" locale under ${relative(webRoot, localesDir)}`);
  process.exit(1);
}

/** Does `key` exist, allowing a plural family to satisfy a base key? */
function has(keys, key) {
  if (keys.has(key)) return true;
  const base = key.replace(PLURAL_SUFFIX, '');
  for (const candidate of keys.keys()) {
    if (candidate.replace(PLURAL_SUFFIX, '') === base) return true;
  }
  return false;
}

for (const [locale, namespaces] of resources) {
  if (locale === REFERENCE) continue;

  for (const [ns, refKeys] of reference) {
    const keys = namespaces.get(ns);
    if (!keys) {
      problems.push(`${locale}/${ns}.json is missing entirely (exists in ${REFERENCE})`);
      continue;
    }
    for (const key of refKeys.keys()) {
      if (!has(keys, key)) {
        problems.push(
          `${locale}/${ns}.json missing "${key}" — the Arabic page would render the English text`,
        );
      }
    }
    for (const key of keys.keys()) {
      if (!has(refKeys, key)) {
        problems.push(
          `${locale}/${ns}.json has "${key}" which does not exist in ${REFERENCE} — a rename left behind?`,
        );
      }
    }
  }

  for (const ns of namespaces.keys()) {
    if (!reference.has(ns)) {
      problems.push(`${locale}/${ns}.json has no ${REFERENCE} counterpart`);
    }
  }
}

// ── 2. Every literal t('…') resolves ─────────────────────────────────────────
const SOURCE_DIRS = ['app', 'components', 'lib'].map((d) => join(webRoot, d));

function* sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* sourceFiles(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      yield full;
    }
  }
}

// `useTranslation('project')` / `useTranslation(['a','b'])` — the namespaces in
// scope for a file. A file with none is skipped: it either does not translate,
// or it receives `t` as a prop, and guessing which would produce noise.
const USE_TRANSLATION = /useTranslation\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
// Literal keys only. A template literal is a dynamic key and is deliberately
// out of scope — see the header.
const T_CALL = /\bt\(\s*'([^'\\]+)'/g;

for (const dir of SOURCE_DIRS) {
  for (const file of sourceFiles(dir)) {
    const src = readFileSync(file, 'utf8');

    const namespaces = [];
    for (const [, raw] of src.matchAll(USE_TRANSLATION)) {
      for (const [, ns] of raw.matchAll(/['"]([^'"]+)['"]/g)) namespaces.push(ns);
    }
    if (namespaces.length === 0) continue;

    for (const [, key] of src.matchAll(T_CALL)) {
      // An explicit `ns:key` names its own namespace and bypasses the list.
      const [maybeNs, ...rest] = key.split(':');
      const explicit = rest.length > 0;
      const lookup = explicit ? rest.join(':') : key;
      const search = explicit ? [maybeNs] : namespaces;

      const found = search.some((ns) => {
        const keys = reference.get(ns);
        return keys ? has(keys, lookup) : false;
      });
      if (!found) {
        problems.push(
          `${relative(webRoot, file)}: t('${key}') does not resolve in [${search.join(', ')}] — this renders the raw key`,
        );
      }
    }
  }
}

// ── 3. Arabic stays Modern Standard Arabic ───────────────────────────────────
/**
 * Colloquial Arabic markers. Arabic UI copy must be **MSA (الفصحى)**, never a
 * regional spoken dialect: these strings appear on the landing page and on the
 * client-facing share page, and a proposal written in Levantine reads as
 * unprofessional to a Gulf, Egyptian or Maghrebi client. MSA is the one register
 * that travels across every Arabic-speaking market this product sells into.
 *
 * Enforced rather than merely documented, on the same reasoning as the ESLint ban
 * on raw hex colors: a convention nothing checks is a convention that drifts. It
 * was already 47 strings deep before anyone noticed.
 *
 * Matching is **whole-token**, because Arabic script has no case and substring
 * matching produced obvious false positives (`هيكل` "structure" contains `هيك`
 * "like this"; `بيانات` "data" looks like a b-imperfect verb). `MSA_ALLOWLIST`
 * holds the words that survive that and are still legitimate.
 */
const DIALECT_TOKENS = new Set([
  'ليش', 'هاد', 'هاي', 'هيك', 'شو', 'مش', 'مو', 'كمان', 'عشان', 'هلق', 'هون',
  'إلك', 'الك', 'بدك', 'بدنا', 'بده', 'بدّه', 'متل', 'لمين', 'مين', 'رح', 'إنت',
  'بتاخد', 'شوف', 'اللي', 'عم', 'تانية', 'سوا', 'حابب', 'حدا', 'ياه', 'لتاخد',
  'منشان', 'ازاي', 'عايز', 'كده', 'دلوقتي',
]);

/** The Levantine/Egyptian b-imperfect prefix — the clearest dialect marker. */
const B_IMPERFECT = /^(بي|بت)[ء-ي]{3,}$/;

/** MSA words the two heuristics above misfire on. */
const MSA_ALLOWLIST = new Set([
  'بيانات', 'بياناتك', 'بياناتها', 'بياناتهم', 'بيانية', 'بيان', 'بيانًا',
  'بيئة', 'بيئات', 'بينما', 'بينهما', 'بينهم', 'بيروت', 'بتاريخ', 'بيتزا',
]);

for (const [ns, keys] of resources.get('ar') ?? []) {
  for (const [key, value] of keys) {
    if (typeof value !== 'string') continue;
    const hits = value
      .split(/[^ء-ي]+/)
      .filter(Boolean)
      .filter(
        (token) =>
          !MSA_ALLOWLIST.has(token) &&
          (DIALECT_TOKENS.has(token) || B_IMPERFECT.test(token)),
      );
    if (hits.length) {
      problems.push(
        `ar/${ns}.json "${key}" uses colloquial Arabic (${[...new Set(hits)].join(', ')}) — UI copy must be Modern Standard Arabic`,
      );
    }
  }
}

if (problems.length) {
  console.error(`\n✗ i18n check failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('');
  process.exit(1);
}

const totalKeys = [...reference.values()].reduce((n, m) => n + m.size, 0);
console.log(
  `✓ i18n OK — ${totalKeys} keys × ${localeNames.length} locales (${localeNames.join(', ')}), no missing translations, no unresolved t() calls`,
);
