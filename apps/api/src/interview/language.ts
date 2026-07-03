/**
 * Lightweight language detection for the interview. We only distinguish Arabic
 * from everything else (treated as English), which is enough to let the adaptive
 * interviewer answer in the same language the user wrote their idea in.
 *
 * Pure + dependency-free so it's trivially testable and runs offline.
 */

export type InterviewLanguage = 'ar' | 'en';

/** Arabic script blocks (base + supplement + presentation forms). */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

/**
 * Returns `'ar'` when a meaningful share of the letters are Arabic, so a mostly
 * Arabic idea (with a few English tech terms) still reads as Arabic. Defaults to
 * `'en'` for empty or non-Arabic text.
 */
export function detectLanguage(text: string): InterviewLanguage {
  if (!text) return 'en';
  const arabic = (text.match(ARABIC) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return 'en';
  return arabic / letters >= 0.3 ? 'ar' : 'en';
}
