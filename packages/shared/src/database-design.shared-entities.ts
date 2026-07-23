/**
 * Cross-tenant SHARED entities — the records a multi-tenant schema must not let
 * one tenant own.
 *
 * `database-design.tenancy.ts` decides *whether* a project is multi-tenant and,
 * when it is, drives a deliberately blunt rule: **every** table holding tenant
 * data carries the tenant foreign key, because a tenant column on `users` alone
 * is not isolation. That rule is right, and it stays.
 *
 * What it had no concept of is the exception every real multi-branch business
 * has. A clinic group's requirements said, in a confirmed business rule, that
 * *patient records are shared across all clinics and are not branch-scoped* —
 * and the schema still shipped `patients.branch_id NOT NULL` plus a "each branch
 * has many patients" relationship, fragmenting into N records the one thing the
 * client had explicitly said must stay unified. Regenerating did not help,
 * because two independent causes both produced it: the business rules were never
 * printed into the schema prompt at all, and `ensureTenancy` put the mandatory FK
 * back afterwards regardless of what the model did.
 *
 * So this module is the rule the generator was missing, stated generally:
 *
 *   Before a table gets a mandatory tenant-ownership foreign key, check whether
 *   the requirements *say* that record is shared. If they do, it does not get
 *   one — whatever the table is called.
 *
 * Four properties are load-bearing:
 *
 *  1. **Nothing is keyed on an entity NAME.** There is no list of "patient,
 *     customer, member". The trigger is a *statement in the client's own
 *     requirements*, and the entity is whatever that statement was about. A
 *     retail chain whose rules say members are shared across stores gets the same
 *     treatment with no code change, which is the whole point.
 *  2. **The restriction covers the shared record ONLY, never its transactions.**
 *     An appointment, order, visit, bill or payment genuinely happens at one
 *     location and must keep its `branch_id`. The unified history is restored by
 *     the *shared* record being single: every branch's bills for a patient are
 *     reachable through one `patient_id`. Widening this to dependents would
 *     destroy real isolation for no gain.
 *  3. **The evidence bar is an explicit statement, never an inference.** Removing
 *     tenant scoping is the dangerous direction — it is the cross-tenant leak
 *     `ensureTenancy` exists to prevent — so a table is only ever exempted
 *     because a human-written rule said so, and the rule is quoted back to the
 *     owner in the notice. Silence means the existing behaviour, unchanged.
 *  4. **A correction is never silent.** Every demotion produces an owner-facing
 *     notice naming the table, what changed, and the sentence that caused it, so
 *     a false positive is visible and correctable rather than a quiet hole.
 *
 * Pure and runtime-free. Imported one-way by `database-design.tenancy.ts` (the
 * reverse would be a cycle), the same shape as `review.fix.ts` → `review.ts`.
 */

import {
  copyFor,
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
  type LocalizedCopy,
} from './artifact-language';
import type { DatabaseDesign, Entity, EntityColumn } from './database-design';
import type { RequirementDocument } from './requirements';
import { singularNoun } from './text';

/**
 * Column names that mark a row as belonging to one tenant.
 *
 * Broad on purpose: this drives *detection*, and being wrong here can only cause
 * a column to be examined, never deleted. `database-design.tenancy.ts` keeps its
 * own deliberately narrow `TENANT_COLUMN` for the strip path, where a false
 * positive would remove real domain data — do not merge the two.
 */
export const TENANT_SCOPE_COLUMN =
  /^(?:tenant|organization|organisation|org|workspace|company|branch|store|merchant|vendor|clinic|hospital|school|campus|warehouse|outlet|practice|franchise|location|site|facility|department)_id$/i;

/** Table names that ARE the tenant boundary. */
export const TENANT_SCOPE_TABLE =
  /^(?:tenants?|organizations?|organisations?|orgs?|accounts?|workspaces?|companies|branches|clinics|hospitals|stores|merchants|vendors|schools|campuses|warehouses|outlets|practices|franchises|locations|sites|facilities)$/i;

/**
 * The prefix a demoted tenant key is renamed with.
 *
 * The rename is not cosmetic — it is what makes the demotion structural. A
 * nullable `branch_id` still reads to every downstream consumer (and to the next
 * engineer) as "the branch this row belongs to"; `registered_at_branch_id` reads
 * as what it now is, a record of where the row originated, and nothing else. The
 * API designer, the scaffold and the SQL export all generate from this artifact,
 * so the name propagates everywhere the old one would have.
 */
export const REFERENCE_ONLY_PREFIX = 'registered_at_';

// ── detecting the statement ────────────────────────────────────────────────

/**
 * The nouns a business writes for "one of the places/organizations we operate".
 *
 * Enumerated ONCE and composed into every pattern below, because the same list
 * spelled out three times is how a safeguard silently switches itself off: the
 * region classifier's MENA regex omitted Palestine, and a Gaza project therefore
 * lost its compliance requirements, its payment-fee note and its residency line
 * with nothing erroring. A missing noun here has the same shape — the rule
 * quietly stops applying to hotel groups, or to law firms with offices.
 *
 * Adding a noun to this list is not cosmetic; it is what turns the rule on for
 * that kind of business.
 */
const LOCATION_NOUN =
  '(?:branch|branches|clinic|clinics|hospital|hospitals|store|stores|shop|shops|' +
  'location|locations|site|sites|tenant|tenants|outlet|outlets|facility|facilities|' +
  'campus|campuses|warehouse|warehouses|department|departments|gym|gyms|hotel|hotels|' +
  'office|offices|centre|centres|center|centers|practice|practices|franchise|franchises|' +
  'organi[sz]ation|organi[sz]ations|school|schools|lab|labs|pharmacy|pharmacies|' +
  'restaurant|restaurants|venue|venues|studio|studios|agency|agencies|club|clubs|' +
  'salon|salons|depot|depots|workspace|workspaces|company|companies|' +
  'subsidiary|subsidiaries|division|divisions|unit|units|region|regions)';

/** The container nouns a shared record is usually described as, in prose. */
const RECORD_NOUN =
  '(?:record|records|profile|profiles|account|accounts|file|files|history|histories|' +
  'identity|identities|chart|charts|ledger|ledgers|number|numbers|membership|memberships)';

/**
 * Language asserting a record is shared across the whole organization.
 *
 * Split from the negation below because they are two different claims, and
 * keeping them apart is what makes each one auditable: a POSITIVE assertion that
 * the record is shared/unified/cross-branch, and a NEGATION of tenant scoping.
 * Both are equally binding; a client writes whichever comes naturally.
 */
const SHARED_ASSERTION_EN = new RegExp(
  '\\b(?:' +
    [
      'shared (?:across|between|among|by|globally|company[- ]wide|network[- ]wide|organi[sz]ation[- ]wide)',
      `share (?:one|a single|the same) ${RECORD_NOUN}`,
      `cross[- ]${LOCATION_NOUN}`,
      `(?:one|a single|the same|unified) (?:unified )?${RECORD_NOUN}(?:[^.!?؟]{0,40}?(?:across|for all|regardless of|no matter))`,
      // NOT "unified view" — that is a reporting/UI idea, and MedCore's own
      // executive summary ("giving the organization a unified view") tripped it.
      `unified (?:across|${RECORD_NOUN})`,
      'globally (?:unique|shared|visible|accessible)',
      `(?:accessible|available|visible|usable|valid|retrievable|reachable|editable|honou?red|recogni[sz]ed) (?:from|at|in|across|by) (?:any|all|every|multiple|either|another|other) ${LOCATION_NOUN}`,
      '(?:portable|transferable|carried) across',
      'follows? (?:the |them |a )?\\w+ (?:across|between)',
      `regardless of (?:the |which |what )?${LOCATION_NOUN}`,
    ].join('|') +
    ')',
  'i',
);

const SCOPING_NEGATION_EN = new RegExp(
  '\\b(?:' +
    [
      `not ${LOCATION_NOUN}[- ]?(?:scoped|specific|bound|owned|restricted|limited|exclusive|based)`,
      `(?:not|never) (?:be )?(?:scoped|tied|bound|restricted|limited|assigned|linked|attached|confined|specific) to (?:a|any|one|a single|the|their) ${LOCATION_NOUN}`,
      `(?:must|does|do|shall|should|can|will|are|is) not belong to (?:a|any|one|a single|the) ${LOCATION_NOUN}`,
      `(?:independent|regardless) of (?:the |any |a )?${LOCATION_NOUN}`,
      `no ${LOCATION_NOUN}[- ]?(?:scoping|ownership|restriction)`,
    ].join('|') +
    ')',
  'i',
);

/**
 * The same claim in Arabic.
 *
 * A requirement document is written in the project's `artifactLanguage`, so an
 * Arabic project states this rule in Arabic and an English-only detector would
 * silently switch the whole safeguard off — the `stripMetrics` failure, where a
 * backstop kept passing its own tests while no longer matching anything. No
 * `\b` anywhere: JavaScript's word boundary is ASCII-only and never fires
 * against Arabic script.
 */
const SHARED_ASSERTION_AR =
  /(?:مشترك\w*\s*(?:بين|عبر|في جميع|لجميع|لكل)|موحّ?د\w*\s*(?:عبر|بين|لجميع|في جميع|لكل)|سجل\s*(?:موحّ?د|مشترك|واحد)|ملف\s*(?:موحّ?د|مشترك|واحد)|عبر\s*(?:جميع|كل|كافة)\s*(?:الفروع|العيادات|المتاجر|المواقع|المستشفيات|الأفرع)|(?:في|من)\s*أي\s*(?:فرع|عيادة|متجر|موقع)|بغض النظر عن\s*(?:ال)?(?:فرع|عيادة|متجر|موقع))/;

const SCOPING_NEGATION_AR =
  /(?:لا\s*(?:يرتبط|ترتبط|يخص|تخص|ينتمي|تنتمي|يقتصر|تقتصر)\s*(?:ب|على)?\s*(?:ال)?(?:فرع|عيادة|متجر|موقع|مستأجر)|غير\s*(?:مرتبط|مقيد|مخصص)\w*\s*ب(?:ال)?(?:فرع|عيادة|متجر|موقع)|ليس\s*(?:خاص|تابع)\w*\s*ل(?:ال)?(?:فرع|عيادة|متجر|موقع))/;

/** Where in the requirement document a declaration was found. */
export type SharedEntitySource =
  | 'business-rule'
  | 'constraint'
  | 'requirement'
  | 'quality-attribute';

export interface SharedEntityDeclaration {
  /**
   * Stemmed nouns the statement's subject could name — the candidates a table
   * name is matched against. Empty when the subject could not be read, which is
   * reported rather than guessed at (see `unmatched` notices).
   */
  candidates: string[];
  /** The sentence itself, quoted back to the owner as the evidence. */
  statement: string;
  source: SharedEntitySource;
}

/** Sentence-final punctuation, Latin and Arabic. */
const SENTENCE_SPLIT = /(?<=[.!?؟;])\s+|\n+/;

/**
 * Head nouns that name a container rather than the thing contained.
 *
 * "Patient **records** are shared across all clinics" is a statement about
 * patients, not about a table called `records`. Without this the subject's head
 * is `record`, which matches nothing, and the declaration is silently dropped —
 * which is exactly the sentence the reported bug was about.
 */
const CONTAINER_NOUNS = new Set([
  'record',
  'data',
  'datum',
  'information',
  'info',
  'profile',
  'file',
  'history',
  'entry',
  'detail',
  'list',
  'table',
  'entity',
  'account',
  'master',
  'chart',
  'document',
  'row',
]);

/** Determiners, modals and copulas that carry no noun. */
const SUBJECT_NOISE = new Set([
  'a',
  'an',
  'the',
  'all',
  'any',
  'each',
  'every',
  'their',
  'its',
  'his',
  'her',
  'our',
  'this',
  'these',
  'those',
  'that',
  'must',
  'should',
  'shall',
  'can',
  'may',
  'will',
  'is',
  'are',
  'be',
  'been',
  'being',
  'was',
  'were',
  'has',
  'have',
  'had',
  'do',
  'does',
  'not',
  'never',
  'always',
  'only',
  'system',
  'platform',
]);

/**
 * Words that end the subject and begin the predicate.
 *
 * English business rules are overwhelmingly `<Subject> <verb> …`, so reading the
 * leading noun phrase is a far more reliable subject-finder than trying to parse
 * around the signal — which may sit at either end of the sentence ("Members can
 * use their membership **at any gym location**").
 */
const PREDICATE_START =
  /^(?:is|are|was|were|be|being|been|must|should|shall|can|could|may|might|will|would|has|have|had|remains?|stays?|belongs?|exists?|shares?|uses?|keeps?)$/;

/**
 * The nouns a statement's subject could be naming.
 *
 * Two sources, and the second is what makes the common medical/retail phrasings
 * work:
 *
 *  - **Walking back from the head of the leading noun phrase**, collecting
 *    container nouns until the first real one. "Patient records" yields
 *    `{record, patient}`; "the patient portal" yields `{portal}` only — so a
 *    sentence about a portal being reachable from any branch does NOT exempt the
 *    `patients` table. That asymmetry is the point: the head noun is what the
 *    sentence is about.
 *  - **Possessors marked with `'s`.** "A patient's medical history must be
 *    accessible from any branch" is a statement about the patient as much as
 *    about the history, and the apostrophe says so explicitly. Without this the
 *    head walk stops at the adjective `medical` and the declaration is lost.
 */
function subjectCandidates(sentence: string): string[] {
  const possessors = [...sentence.matchAll(/\b([a-z]+)(?:'s|s')\b/gi)].map((m) =>
    m[1].toLowerCase(),
  );

  const bare = sentence.replace(/\b([a-z]+)(?:'s|s')\b/gi, '$1');

  // A compound sentence has one subject per clause, and the shared record is as
  // often in the second as the first: *"A membership is shared across all
  // locations — members can check in at any location."* Reading only the leading
  // noun phrase of the whole sentence sees `membership` and never `member`.
  const heads = bare.split(CLAUSE_SPLIT).flatMap((clause) => clauseHeads(clause));

  return [...new Set([...heads, ...possessors].flatMap(nounVariants))].filter(
    (t) => t.length >= 3,
  );
}

/** Clause boundaries within one sentence. */
const CLAUSE_SPLIT = /\s*[—–]\s*|,\s+(?:and|but|while|whereas|so)\s+|:\s+/;

/**
 * The nouns the leading noun phrase of one clause is about.
 *
 * Walks back from the head, collecting container nouns until the first real one,
 * so *"Patient records"* yields `{record, patient}` while *"the patient portal"*
 * yields `{portal}` alone — a sentence about a portal being reachable from any
 * branch must not exempt the `patients` table.
 */
function clauseHeads(clause: string): string[] {
  const words = clause
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

  const phrase: string[] = [];
  for (const word of words) {
    if (PREDICATE_START.test(word)) break;
    if (SUBJECT_NOISE.has(word)) continue;
    phrase.push(word);
  }

  const heads: string[] = [];
  for (let i = phrase.length - 1; i >= 0; i -= 1) {
    heads.push(phrase[i]);
    if (!CONTAINER_NOUNS.has(singularNoun(phrase[i]))) break;
  }
  return heads;
}

/**
 * A noun and the noun it is derived from.
 *
 * `-ship` names the *state* of being something, so a rule about a **membership**
 * is a rule about the **member**, and a schema is as likely to call that table
 * `members` as `memberships`. Applied to both sides of the match so the two
 * spellings meet in the middle regardless of which the client and the model
 * happened to pick.
 *
 * Deliberately just this one suffix. It is a closed, short class (membership,
 * ownership, partnership, sponsorship) that always de-suffixes to a real noun —
 * unlike `-ing` or `-ment`, which would start folding unrelated words together.
 */
function nounVariants(word: string): string[] {
  const base = singularNoun(word);
  return base.endsWith('ship') && base.length > 6
    ? [base, base.slice(0, -4)]
    : [base];
}

/**
 * Every sentence a shared-scope statement can live in, tagged by section.
 *
 * **The executive summary and the service responsibilities are deliberately NOT
 * sources**, and that exclusion was written from real output. A summary is
 * marketing prose describing the product, so it is thick with the vocabulary
 * this module looks for while asserting nothing about record scope: MedCore's
 * own summary promised billing *"across all clinics"* and *"a unified view"*,
 * and both produced a warning on a schema where nothing was wrong. A check that
 * cries wolf teaches the owner to mute the panel, which costs more than the rare
 * declaration that only ever appears in a summary.
 *
 * A statement that a record is shared is a RULE, and it belongs where rules
 * live.
 */
function statementSources(
  requirements: RequirementDocument,
): { text: string; source: SharedEntitySource }[] {
  return [
    // Business rules first: this is where a client's "patients are shared across
    // clinics" actually lands, and it is the section the schema prompt never
    // printed.
    ...(requirements.businessRules ?? []).map((b) => ({
      text: b.description,
      source: 'business-rule' as const,
    })),
    ...(requirements.constraints ?? []).map((c) => ({
      text: c,
      source: 'constraint' as const,
    })),
    ...(requirements.functional ?? []).map((f) => ({
      text: `${f.title}. ${f.description}`,
      source: 'requirement' as const,
    })),
    ...(requirements.nonFunctional ?? []).map((n) => ({
      text: n.description,
      source: 'quality-attribute' as const,
    })),
  ].filter((s) => typeof s.text === 'string' && s.text.trim().length > 0);
}

/** Does this one sentence assert that its subject is shared across tenants? */
function assertsSharedScope(sentence: string): boolean {
  return (
    SHARED_ASSERTION_EN.test(sentence) ||
    SCOPING_NEGATION_EN.test(sentence) ||
    SHARED_ASSERTION_AR.test(sentence) ||
    SCOPING_NEGATION_AR.test(sentence)
  );
}

/**
 * Every statement in the requirements declaring some record cross-tenant.
 *
 * Sentence-scoped: the signal and the subject must be in the **same** sentence.
 * A document that mentions patients in one rule and "shared across clinics" in
 * an unrelated one has declared nothing, and reading the two together would be
 * the kind of inference this module refuses to make.
 */
export function findSharedEntityDeclarations(
  requirements: RequirementDocument,
): SharedEntityDeclaration[] {
  const out: SharedEntityDeclaration[] = [];
  const seen = new Set<string>();

  for (const { text, source } of statementSources(requirements)) {
    for (const raw of text.split(SENTENCE_SPLIT)) {
      const sentence = raw.trim();
      if (!sentence || !assertsSharedScope(sentence)) continue;
      if (seen.has(sentence)) continue;
      seen.add(sentence);
      out.push({ candidates: subjectCandidates(sentence), statement: sentence, source });
    }
  }
  return out;
}

// ── matching a table against the statements ────────────────────────────────

/**
 * The nouns a table name is "about" — the mirror of `subjectCandidates`.
 *
 * `patients` → `{patient}`; `patient_records` → `{record, patient}`;
 * `patient_portal_sessions` → `{session}`. Walking back through container nouns
 * on both sides is what lets a rule written about "patient records" match a
 * table called `patients`, and what stops a rule about a "patient portal" from
 * matching it.
 */
function entityCandidates(tableName: string): string[] {
  const words = tableName
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(singularNoun);

  const heads: string[] = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    heads.push(words[i]);
    if (!CONTAINER_NOUNS.has(words[i])) break;
  }
  return heads.flatMap(nounVariants).filter((t) => t.length >= 3);
}

/**
 * The declaration exempting this table, or `null`.
 *
 * Returns the declaration rather than a boolean so the caller can quote the
 * client's own sentence in the notice. An owner shown "we removed the ownership
 * key from patients" needs to see *why*; a bare correction with no source reads
 * as the tool making things up.
 */
export function sharedEntityDeclarationFor(
  tableName: string,
  declarations: readonly SharedEntityDeclaration[],
): SharedEntityDeclaration | null {
  const heads = entityCandidates(tableName);
  if (heads.length === 0) return null;
  return (
    declarations.find(
      (d) => d.candidates.length > 0 && d.candidates.some((c) => heads.includes(c)),
    ) ?? null
  );
}

/** Convenience predicate for callers that do not need the evidence. */
export function isSharedEntity(
  tableName: string,
  declarations: readonly SharedEntityDeclaration[],
): boolean {
  return sharedEntityDeclarationFor(tableName, declarations) !== null;
}

// ── the prompt directive ───────────────────────────────────────────────────

/**
 * The shared-entity instruction, written from the declarations the code found.
 *
 * English, like every other directive here: it is an instruction to the model,
 * not prose a client reads.
 *
 * Two things about its wording are deliberate. It is marked as **overriding**
 * the tenancy rule directly above it, because the two genuinely conflict and a
 * model handed two emphatic rules with no stated precedence picks one per run —
 * which is the non-determinism the whole tenancy module exists to remove. And it
 * states the carve-out for transactions explicitly, because a rule that only says
 * "do not scope this" reads as licence to stop scoping the tables around it too.
 *
 * Returns `''` when nothing was declared: a directive about an exception that
 * does not apply is noise in a prompt already competing for attention.
 */
export function sharedEntityDirective(
  declarations: readonly SharedEntityDeclaration[],
  tenant: { table: string; column: string },
): string {
  const usable = declarations.filter((d) => d.candidates.length > 0);
  if (usable.length === 0) return '';

  const singular = tenant.column.replace(/_id$/, '');
  return [
    `SHARED (CROSS-${singular.toUpperCase()}) RECORDS — HARD CONSTRAINT. This OVERRIDES the tenant-scoping rule above wherever the two disagree.`,
    'The confirmed requirements state that the records described by these sentences are shared across the whole organization and are NOT owned by one ' +
      `${singular}:`,
    ...usable.map((d) => `- "${d.statement}"`),
    'For the table representing each of those records you MUST NOT:',
    `  * add a mandatory (NOT NULL) ${tenant.column}, or any other single-${singular} ownership foreign key;`,
    `  * add a "${tenant.table} has many <that table>" one-to-many relationship;`,
    `  * use ${tenant.column} in a unique constraint, or as the basis for access control.`,
    `If the table genuinely needs to record where it originated, use a NULLABLE column named ${REFERENCE_ONLY_PREFIX}${tenant.column} and treat it as reference only.`,
    `This restriction applies to the SHARED RECORD ITSELF ONLY. A transaction or event that merely references it — an appointment, visit, order, bill, payment, claim, booking — legitimately happens at one ${singular} and MUST still carry ${tenant.column}.`,
  ].join('\n');
}

// ── the post-generation validation pass ────────────────────────────────────

export interface SharedEntityCorrection {
  /** The table corrected, or '' for a declaration matched to no table. */
  entity: string;
  action: 'demoted' | 'dropped-ownership-relation' | 'unmatched';
  /** The requirement sentence that drove it. */
  statement: string;
}

export interface SharedEntityReconciliation {
  design: DatabaseDesign;
  corrections: SharedEntityCorrection[];
  /** Owner-facing sentences, in the artifact's language. */
  notices: string[];
}

/** Is this column a single-tenant ownership key? */
function isOwnershipKey(column: EntityColumn, tenantTables: ReadonlySet<string>): boolean {
  if (column.primaryKey) return false;
  const target = column.references?.entity.trim().toLowerCase();
  if (target && tenantTables.has(target)) return true;
  return !column.references && TENANT_SCOPE_COLUMN.test(column.name);
}

/** Has this column already been demoted (by us, or by a model that got it right)? */
function alreadyReferenceOnly(column: EntityColumn): boolean {
  return column.nullable && !column.unique && column.name.startsWith(REFERENCE_ONLY_PREFIX);
}

/** Every table in this design acting as the tenant boundary. */
function tenantTablesOf(
  design: DatabaseDesign,
  tenant: { table: string; column: string },
): Set<string> {
  const names = new Set<string>([tenant.table.trim().toLowerCase()]);
  for (const entity of design.entities ?? []) {
    if (TENANT_SCOPE_TABLE.test(entity.name.trim())) {
      names.add(entity.name.trim().toLowerCase());
    }
  }
  // A model may name the boundary something the pattern above doesn't know
  // ("practices", "franchise_units"). Whatever the scoping columns point AT is
  // the boundary by definition, so read it off the schema rather than guessing.
  for (const entity of design.entities ?? []) {
    for (const column of entity.columns ?? []) {
      if (column.references && TENANT_SCOPE_COLUMN.test(column.name)) {
        names.add(column.references.entity.trim().toLowerCase());
      }
    }
  }
  return names;
}

/**
 * Cross-check a generated schema against the shared-record statements and
 * correct it.
 *
 * This is the backstop half of the standing division of labour: the directive
 * above is the primary defence, and this runs on the output regardless of
 * whether the model honoured it — including on the deterministic fallback and on
 * every chunk of a chunked build, where no single call ever sees the whole
 * schema and a per-chunk instruction could not be checked.
 *
 * It **demotes rather than deletes**. Dropping the column outright would discard
 * a fact the schema may legitimately want (which branch first registered this
 * patient); a nullable, renamed, non-unique column keeps the fact while making it
 * structurally unusable as ownership — which is the actual requirement. The
 * ownership relationship is dropped outright, because unlike the column it
 * carries no information beyond the claim being corrected.
 */
export function reconcileSharedEntities(
  design: DatabaseDesign,
  declarations: readonly SharedEntityDeclaration[],
  tenant: { table: string; column: string },
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): SharedEntityReconciliation {
  if (declarations.length === 0) return { design, corrections: [], notices: [] };

  const tenantTables = tenantTablesOf(design, tenant);
  const corrections: SharedEntityCorrection[] = [];
  const notices: string[] = [];
  const sharedTables = new Set<string>();
  const matched = new Set<SharedEntityDeclaration>();

  const entities: Entity[] = (design.entities ?? []).map((entity) => {
    const name = entity.name.trim();
    if (tenantTables.has(name.toLowerCase())) return entity;

    const declaration = sharedEntityDeclarationFor(name, declarations);
    if (!declaration) return entity;
    matched.add(declaration);
    sharedTables.add(name.toLowerCase());

    const demoted: string[] = [];
    const columns = (entity.columns ?? []).map((column) => {
      if (!isOwnershipKey(column, tenantTables) || alreadyReferenceOnly(column)) {
        return column;
      }
      const renamed = column.name.startsWith(REFERENCE_ONLY_PREFIX)
        ? column.name
        : `${REFERENCE_ONLY_PREFIX}${column.name}`;
      demoted.push(column.name);
      // Nullable and never unique: the two properties that make it impossible to
      // use for primary ownership, access control, or a per-tenant uniqueness
      // constraint. The reference itself is kept — it is still a real FK.
      return { ...column, name: renamed, nullable: true, unique: false };
    });

    if (demoted.length === 0) return entity;
    corrections.push({ entity: name, action: 'demoted', statement: declaration.statement });
    notices.push(
      copyFor(NOTICE_DEMOTED, language)({
        entity: name,
        columns: demoted,
        statement: declaration.statement,
        tenantColumn: tenant.column,
      }),
    );
    return { ...entity, columns };
  });

  // The ownership relationship is the other half of the claim: a schema can have
  // no `branch_id` on patients and still tell every reader, in the ERD and in the
  // generated Prisma, that a branch has many patients.
  const droppedRelations = (design.relations ?? []).filter(
    (r) =>
      tenantTables.has(r.from?.trim().toLowerCase() ?? '') &&
      sharedTables.has(r.to?.trim().toLowerCase() ?? '') &&
      r.type !== 'many-to-many',
  );
  for (const relation of droppedRelations) {
    const declaration = sharedEntityDeclarationFor(relation.to, declarations);
    corrections.push({
      entity: relation.to,
      action: 'dropped-ownership-relation',
      statement: declaration?.statement ?? '',
    });
    notices.push(
      copyFor(NOTICE_RELATION, language)({
        entity: relation.to,
        tenantTable: relation.from,
      }),
    );
  }

  // A statement we could read but could not attribute to a table is reported, not
  // dropped. "We found a rule about shared records and could not tell which table
  // it means" is information the owner can act on; silence is not — and this is
  // the expected path for an Arabic document, whose subject we deliberately do
  // not try to parse (see `subjectCandidates`).
  for (const declaration of declarations) {
    if (matched.has(declaration)) continue;
    corrections.push({ entity: '', action: 'unmatched', statement: declaration.statement });
    notices.push(
      copyFor(NOTICE_UNMATCHED, language)({
        statement: declaration.statement,
        tenantColumn: tenant.column,
      }),
    );
  }

  return {
    design: {
      ...design,
      entities,
      relations: (design.relations ?? []).filter((r) => !droppedRelations.includes(r)),
    },
    corrections,
    notices,
  };
}

// ── owner-facing prose ─────────────────────────────────────────────────────

/**
 * Deterministic prose, so it is `LocalizedCopy` — an Arabic project must not get
 * an English paragraph dropped into its schema page. Only identifiers are
 * interpolated (table and column names), which stay English at every language
 * under `CODE_FACING_RULE`; the client's own sentence is quoted verbatim and is
 * already in the document's language.
 */
const NOTICE_DEMOTED: LocalizedCopy<
  (p: {
    entity: string;
    columns: string[];
    statement: string;
    tenantColumn: string;
  }) => string
> = {
  en: ({ entity, columns, statement, tenantColumn }) =>
    `"${entity}" is shared across the organization, so ${columns
      .map((c) => `"${c}"`)
      .join(', ')} was made nullable and renamed with the "${REFERENCE_ONLY_PREFIX}" ` +
    `prefix: it now records where the record originated and must not be used for ownership, ` +
    `uniqueness or access control. Transactions that reference "${entity}" keep their own ` +
    `${tenantColumn}. From the requirements: “${statement}”`,
  ar: ({ entity, columns, statement, tenantColumn }) =>
    `السجل "${entity}" مشترك على مستوى المؤسسة، لذلك تم جعل ${columns
      .map((c) => `"${c}"`)
      .join('، ')} قابلاً للقيمة الفارغة وإعادة تسميته ببادئة "${REFERENCE_ONLY_PREFIX}": ` +
    `فهو الآن يسجّل مكان إنشاء السجل فقط، ولا يجوز استخدامه للملكية أو التفرّد أو التحكم في الوصول. ` +
    `أما المعاملات التي تشير إلى "${entity}" فتحتفظ بعمود ${tenantColumn} الخاص بها. ` +
    `من المتطلبات: «${statement}»`,
};

const NOTICE_RELATION: LocalizedCopy<
  (p: { entity: string; tenantTable: string }) => string
> = {
  en: ({ entity, tenantTable }) =>
    `Removed the "${tenantTable} has many ${entity}" relationship: the requirements describe ` +
    `"${entity}" as one shared record for the whole organization, not one per ${tenantTable}.`,
  ar: ({ entity, tenantTable }) =>
    `تمت إزالة العلاقة "${tenantTable} has many ${entity}": المتطلبات تصف "${entity}" ` +
    `كسجل واحد مشترك على مستوى المؤسسة، وليس سجلاً لكل ${tenantTable}.`,
};

const NOTICE_UNMATCHED: LocalizedCopy<
  (p: { statement: string; tenantColumn: string }) => string
> = {
  en: ({ statement, tenantColumn }) =>
    `The requirements state that a record is shared across the organization, but no table in ` +
    `this schema could be matched to it — check by hand that the right table has no mandatory ` +
    `${tenantColumn}. Stated: “${statement}”`,
  ar: ({ statement, tenantColumn }) =>
    `تنص المتطلبات على أن أحد السجلات مشترك على مستوى المؤسسة، لكن لم يتم مطابقته بأي جدول ` +
    `في هذا المخطط — يرجى التحقق يدوياً من أن الجدول الصحيح لا يحمل عمود ${tenantColumn} إلزامياً. ` +
    `النص: «${statement}»`,
};
