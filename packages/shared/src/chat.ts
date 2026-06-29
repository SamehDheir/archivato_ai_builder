/**
 * Post-generation AI chat (Slice 10). After the pipeline produces a full design,
 * the user can refine it in natural language ("Add notifications", "Make it
 * scalable to 5M users"). Each instruction amends the Requirement Document and
 * the downstream stages (system / database / API, and the review if present) are
 * regenerated so everything stays consistent.
 */

import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';
import type { DatabaseDesign } from './database-design';
import type { ApiDesign } from './api-design';
import type { ReviewReport } from './review';

export type ChatRole = 'user' | 'assistant';

/** One message in the refinement conversation. */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** Body of POST /chat/:sessionId. */
export interface RefineRequest {
  instruction: string;
}

/**
 * The result of one refinement turn: the full transcript plus every artifact
 * that may have changed, so the client can re-render the whole design at once.
 */
export interface RefineResult {
  messages: ChatMessage[];
  requirementDocument: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
  /** Regenerated only if a review already existed; otherwise null. */
  reviewReport: ReviewReport | null;
}
