/**
 * Interview language — which language to ask the next question in.
 *
 * This used to be its own detector. It is now a re-export of the shared
 * `detectArtifactLanguage`, because the interview language and the project's
 * artifact language are **the same decision**: the client described their
 * business in some language, the interview should ask in it, and the scoping
 * document they are handed at the end should come back in it.
 *
 * Keeping two copies meant two thresholds that could disagree about the same
 * project — an interview conducted in Arabic feeding a pipeline that generated
 * English, which is precisely the half-translated result this consolidation
 * exists to prevent. The shared module also carries the prompt rules the agents
 * need, so the type and the instruction cannot drift apart either.
 */

import {
  detectArtifactLanguage,
  type ArtifactLanguage,
} from '@archivato/shared';

/** Kept as an alias so the interviewer's context type still reads in its own terms. */
export type InterviewLanguage = ArtifactLanguage;

export const detectLanguage = detectArtifactLanguage;
