import type { PatchSectionKey } from '@archivato/shared';

/**
 * Turning a patched artifact section into something a person can actually read.
 *
 * The owner is approving a change to a document they will send a client, so the
 * preview has to show *the document*, not the transport. Raw JSON would technically
 * contain the same information and would be worthless for the decision being made —
 * they'd be diffing punctuation instead of judging wording.
 *
 * Pure, so it is unit-testable and can't fail at render time.
 */

/**
 * The fields that make up a readable line, in reading order. One list covers every
 * patchable section: the shapes are all small records, and each contributes only
 * the fields it has. A generic list rather than a per-section template because the
 * alternative — ten templates — drifts the moment a shared type gains a field, and
 * a preview that silently omits a field is worse than one that shows it plainly.
 */
const LINE_FIELDS = [
  'id',
  'layer',
  'constraint',
  'item',
  'name',
  'title',
  'technology',
  'category',
  'assumption',
  'priority',
  'description',
  'rationale',
  'reason',
  'howAddressed',
  'impactIfWrong',
] as const;

/** One readable line for a section entry (a string, or a small record). */
function lineFor(entry: unknown): string {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object') return String(entry);

  const record = entry as Record<string, unknown>;
  const parts = LINE_FIELDS.filter(
    (field) => typeof record[field] === 'string' && record[field],
  ).map((field) => record[field] as string);

  const permissions = record.permissions;
  if (Array.isArray(permissions) && permissions.length > 0) {
    parts.push(`[${permissions.join(', ')}]`);
  }
  // Nothing recognized — show the raw shape rather than an empty row, so a
  // preview never silently hides content the owner is about to approve.
  return parts.length ? parts.join(' · ') : JSON.stringify(entry);
}

/** A section's content as readable lines. */
export function sectionLines(content: unknown): string[] {
  if (content == null) return [];
  if (typeof content === 'string') {
    return content.split('\n').filter((line) => line.trim().length > 0);
  }
  if (Array.isArray(content)) {
    return content.map(lineFor).filter((line) => line.length > 0);
  }
  return [lineFor(content)].filter((line) => line.length > 0);
}

export type DiffKind = 'added' | 'removed' | 'same';

export interface DiffLine {
  text: string;
  kind: DiffKind;
}

/**
 * A set-based line diff. Deliberately not an LCS: these sections are short lists
 * of independent statements, so "which lines are new, which are gone" is the whole
 * question — a move is not a meaningful edit here, and treating one as a
 * remove+add is the honest reading anyway.
 */
export function diffSection(before: unknown, after: unknown): {
  before: DiffLine[];
  after: DiffLine[];
  changed: boolean;
} {
  const beforeLines = sectionLines(before);
  const afterLines = sectionLines(after);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const left: DiffLine[] = beforeLines.map((text) => ({
    text,
    kind: afterSet.has(text) ? 'same' : 'removed',
  }));
  const right: DiffLine[] = afterLines.map((text) => ({
    text,
    kind: beforeSet.has(text) ? 'same' : 'added',
  }));

  return {
    before: left,
    after: right,
    changed: left.some((l) => l.kind !== 'same') || right.some((l) => l.kind !== 'same'),
  };
}

/** The i18n key for a section's human label (`stages:review.fix.section.*`). */
export function sectionLabelKey(key: PatchSectionKey): string {
  return `review.fix.section.${key}`;
}
