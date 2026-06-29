/**
 * Project version history. Every modification (generating/regenerating a stage,
 * or applying a chat refinement) snapshots the whole project — all artifacts at
 * that moment — as the next sequential version. Versions can be compared
 * (side-by-side) and restored. Keep these types runtime-free (api + web).
 */

import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';
import type { DatabaseDesign } from './database-design';
import type { ApiDesign } from './api-design';
import type { ReviewReport } from './review';

/** A point-in-time capture of every generated artifact for a project. */
export interface ProjectSnapshot {
  requirements: RequirementDocument | null;
  systemDesign: SystemDesign | null;
  databaseDesign: DatabaseDesign | null;
  apiDesign: ApiDesign | null;
  review: ReviewReport | null;
}

/** Version metadata for the history list (no heavy snapshot payload). */
export interface ProjectVersionMeta {
  id: string;
  sessionId: string;
  /** Sequential, 1-based, per project. */
  version: number;
  /** What produced this version, e.g. "generate api-design" or "refine: …". */
  label: string;
  createdAt: string;
}

/** A version plus its full artifact snapshot (for compare / restore). */
export interface ProjectVersionDetail extends ProjectVersionMeta {
  snapshot: ProjectSnapshot;
}
