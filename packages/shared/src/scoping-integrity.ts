/**
 * Field-provenance integrity for the scoping chain.
 *
 * Every structured field in the requirement document is supposed to be a
 * *synthesis* of a specific part of the interview. Three failure modes were
 * reported across repeated runs of two unrelated projects, and they are three
 * faces of one problem — **nothing ever checked that a field's content came
 * from the source that field is derived from**:
 *
 *  1. **Verbatim bleed-through** — an answer meant for one field rendered whole
 *     inside another (the Scale paragraph duplicated into Constraints).
 *  2. **Silently empty** — a field rendered as a bare "—" while the transcript
 *     plainly contained material for it, and an extraction failure was
 *     indistinguishable from "there is nothing here".
 *  3. **Invented content** — a role the client never named, with fabricated
 *     permissions, asserted as settled fact.
 *
 * The three are fixed by three different mechanisms on purpose, because they
 * are not equally decidable:
 *
 *  - (1) is **structural** and is fixed at the source (`summaryFromSlots` reads
 *    one slot per field). `sharesVerbatimSpan` here is the *detector*, used by
 *    the regression suite to keep it fixed. It is deliberately not a runtime
 *    regenerate trigger: a fuzzy string signal firing on a paid LLM call is the
 *    kind of expensive false positive this codebase refuses elsewhere.
 *  - (2) and (3) **are** decidable enough to act on at runtime, and both act by
 *    *saying so* rather than by editing the document. An unsourced role is kept
 *    and flagged as an assumption; an unexplained empty section is labelled as
 *    an extraction gap. Deleting a role the model may well have inferred
 *    correctly, or inventing rules to fill a section, would both be worse than
 *    the honest note.
 *
 * Pure and runtime-free, in the shared package so the API and the web read the
 * same rules.
 */

import { significantTokens } from './text';
import {
  copyFor,
  DEFAULT_ARTIFACT_LANGUAGE,
  type ArtifactLanguage,
  type LocalizedCopy,
} from './artifact-language';

/**
 * Filler that says nothing about *which* capability or role is meant. Matches
 * the spirit of `SCOPE_STOP_WORDS` in `review.ts` — these words appear in
 * nearly every answer, so letting them count as evidence of a shared source
 * would make every field look like every other field.
 */
const PROVENANCE_STOP_WORDS: ReadonlySet<string> = new Set([
  'that',
  'this',
  'they',
  'them',
  'with',
  'from',
  'have',
  'will',
  'must',
  'should',
  'system',
  'systems',
  'user',
  'users',
  'able',
  'also',
  'need',
  'needs',
  'want',
  'wants',
  'each',
  'their',
  'there',
  'when',
  'which',
  'into',
  'about',
  'role',
  'roles',
  'staff',
  'team',
  'member',
  'members',
  'platform',
  'application',
  'software',
]);

/**
 * Is this role name traceable to what the client actually said?
 *
 * The test is **containment**: every distinctive word of the role name must
 * appear somewhere in the stated roles text. That is a strong claim, and it is
 * the right one here — the same reasoning as `namesExcludedCapability`, which
 * is split out from `describesSameCapability` for exactly this reason.
 *
 * The trap that decides the matcher: a fabricated **"Customer Service"** role
 * shares the word *customer* with a genuinely stated **"Customer"** role. A
 * shared-token rule (even a two-token one) would call the invention sourced and
 * wave it through, which is the bug. Containment asks "is *service* here too?"
 * and correctly says no.
 */
export function roleIsSourced(roleName: string, statedRoles: string): boolean {
  const nameTokens = significantTokens(roleName, PROVENANCE_STOP_WORDS);
  // A name made entirely of filler ("Team Member") carries no evidence either
  // way. Treat it as sourced: flagging a role we cannot actually assess would
  // put noise in front of the owner, and the whole value of this check is that
  // it only speaks when it is sure.
  if (nameTokens.length === 0) return true;
  const stated = new Set(significantTokens(statedRoles, PROVENANCE_STOP_WORDS));
  return nameTokens.every((token) => stated.has(token));
}

/**
 * Role names in the document that the client never named.
 *
 * Returns `[]` when no roles were stated at all — with nothing to compare
 * against, every role is equally unverifiable, and flagging all of them would
 * be a guess dressed as a finding. Same rule as `parseBudget` returning null
 * rather than estimating: no evidence yields no claim, never a default.
 */
export function unsourcedRoleNames(
  roleNames: readonly string[],
  statedRoles: string,
): string[] {
  const stated = statedRoles.trim();
  if (!stated) return [];
  return roleNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !roleIsSourced(name, stated));
}

/**
 * The shortest run of words that counts as "this text was copied, not written".
 *
 * Eight is high enough that a shared phrase has to be a real span of the
 * client's own sentence rather than a turn of phrase two summaries would
 * plausibly reach for independently ("orders per day at peak"). The cost of
 * being wrong is asymmetric in the usual direction: a missed bleed is a
 * duplicated paragraph, a false positive would fail a build over prose that is
 * genuinely fine.
 */
export const VERBATIM_SPAN_WORDS = 8;

/** Words, lower-cased, punctuation dropped — a comparable form for both texts. */
function wordSequence(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Does `candidate` contain a run of `minWords` consecutive words lifted
 * verbatim from `source`?
 *
 * This is the detector for bleed-through: a field that was *synthesized* from
 * an answer shares vocabulary with it, while a field that was *pasted* from it
 * shares whole clauses. Comparing word runs rather than characters means
 * whitespace and punctuation differences do not hide a copy.
 */
export function sharesVerbatimSpan(
  candidate: string,
  source: string,
  minWords: number = VERBATIM_SPAN_WORDS,
): boolean {
  const a = wordSequence(candidate);
  const b = wordSequence(source);
  if (a.length < minWords || b.length < minWords) return false;

  const spans = new Set<string>();
  for (let i = 0; i + minWords <= b.length; i += 1) {
    spans.add(b.slice(i, i + minWords).join(' '));
  }
  for (let i = 0; i + minWords <= a.length; i += 1) {
    if (spans.has(a.slice(i, i + minWords).join(' '))) return true;
  }
  return false;
}

/**
 * Language that means the speaker is stating a *policy* — the raw material of a
 * business rule.
 *
 * Kept in code rather than left to the model for the same reason as
 * `DOMAIN_FOLLOW_UPS`: it has to give the same answer every run, since its
 * entire job is to notice when the model's answer changed for no reason.
 *
 * These are the shapes a rule takes in ordinary speech — an obligation
 * ("must", "has to"), a prohibition ("cannot", "never"), a condition ("only
 * if", "if the"), a threshold ("at least", "more than"), or an automatic
 * consequence ("automatically", "triggers"). Reported example: *"lab results
 * must be flagged if critical"* and *"inventory must auto-decrement and
 * trigger reorder at threshold"* — both plainly rules, both dropped.
 */
const RULE_LANGUAGE =
  /\b(?:must|cannot|can't|may not|never|not allowed|only if|only when|if the|at least|no more than|more than|less than|exceeds?|threshold|automatic(?:ally)?|auto-?\w+|triggers?|requires?|required|mandatory|approve[sd]?|approval|reject(?:ed|s)?|expire[sd]?|deadline|limit(?:ed|s)?)\b/i;

/**
 * Does the transcript contain material a business rule could be extracted from?
 *
 * Used to tell an **empty** business-rules section apart from a **failed** one.
 * The distinction is the point: a bare "—" reads to the owner as "this project
 * has no rules", and there is no way to see that extraction simply dropped
 * them. This returns true only when the client's own words carry policy
 * language, so the resulting note is never speculative.
 */
export function transcriptSuggestsBusinessRules(transcript: string): boolean {
  return RULE_LANGUAGE.test(transcript ?? '');
}

/**
 * The note that stands in for a silently-empty section.
 *
 * Phrased as a review instruction rather than as content, because it is going
 * into a document a client may read: it has to be obvious that this is the
 * tool reporting on itself, not a finding about the client's business. It goes
 * into the assumptions list, which is precisely the section for "here is
 * something we could not settle".
 */
const PROVENANCE_COPY: LocalizedCopy<{
  extractionGapAssumption: string;
  extractionGapImpact: string;
  roleAssumption: (roleName: string) => string;
  roleImpact: string;
}> = {
  en: {
    extractionGapAssumption:
      'Assumed there are no additional business rules beyond those already captured. ' +
      'The discovery call did contain policy language (approvals, thresholds, automatic actions) ' +
      'that could not be extracted into discrete rules — review this section manually before sending.',
    extractionGapImpact:
      'A missed rule usually surfaces during build as rework, since the behaviour was expected but never specified.',
    roleAssumption: (roleName) =>
      `Assumed the project needs a "${roleName}" role — it was inferred from the described workflows, not named by the client.`,
    roleImpact:
      'If this role does not exist, its permissions and screens are unnecessary scope; if it is really two roles, the permission model needs revisiting.',
  },
  ar: {
    extractionGapAssumption:
      'افترضنا عدم وجود قواعد عمل إضافية غير ما تم توثيقه. ' +
      'تضمّنت مكالمة الاستكشاف صياغات سياسات (موافقات، حدود، إجراءات تلقائية) ' +
      'تعذّر استخلاصها إلى قواعد منفصلة — راجع هذا القسم يدويًا قبل الإرسال.',
    extractionGapImpact:
      'القاعدة المُغفَلة تظهر عادةً أثناء التنفيذ على شكل إعادة عمل، لأن السلوك كان متوقَّعًا دون أن يُوثَّق.',
    roleAssumption: (roleName) =>
      `افترضنا أن المشروع يحتاج إلى دور «${roleName}» — استُنتج من سير العمل الموصوف ولم يذكره العميل صراحةً.`,
    roleImpact:
      'إن لم يكن هذا الدور موجودًا فإن صلاحياته وشاشاته نطاق زائد؛ وإن كان في الواقع دورين فإن نموذج الصلاحيات يحتاج إلى مراجعة.',
  },
};

/**
 * The note that stands in for a silently-empty business-rules section, in the
 * document's own language.
 *
 * A function rather than the pair of constants it replaces: these lines go into
 * the assumptions list of a document a client reads, and a hardcoded English
 * pair dropped two English sentences into an otherwise Arabic section — the
 * partial-translation failure this module is otherwise dedicated to catching,
 * committed by the module itself.
 */
export function extractionGapAssumption(
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): { assumption: string; impactIfWrong: string } {
  const copy = copyFor(PROVENANCE_COPY, language);
  return {
    assumption: copy.extractionGapAssumption,
    impactIfWrong: copy.extractionGapImpact,
  };
}

/**
 * The assumption line for a role the client never named.
 *
 * The role is **kept**, not deleted. The model may have inferred it correctly
 * from a workflow that plainly needs someone to perform it, and silently
 * dropping a real role would leave a gap nobody can see. What it must not do is
 * present it as something the client said — so it is stated as an inference,
 * with the cost of being wrong attached. This is the pattern the pipeline
 * already gets right for hosting region and compliance regime, applied to the
 * one other place a specific was being asserted without a source.
 */
export function unsourcedRoleAssumption(
  roleName: string,
  language: ArtifactLanguage = DEFAULT_ARTIFACT_LANGUAGE,
): {
  assumption: string;
  impactIfWrong: string;
} {
  const copy = copyFor(PROVENANCE_COPY, language);
  return {
    // The role NAME is interpolated as the model wrote it and is never
    // translated — it is a proper noun in this document, and the schema, the
    // permission tables and the API all refer to it by that exact string.
    assumption: copy.roleAssumption(roleName),
    impactIfWrong: copy.roleImpact,
  };
}
