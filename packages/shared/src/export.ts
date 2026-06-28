/**
 * The Export stage (spec Step 10): bundles the generated pipeline into portable
 * formats — JSON, Markdown, OpenAPI, and a GitHub project structure. PDF is
 * produced client-side (print) so the API needs no heavyweight PDF dependency.
 */

import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';
import type { DatabaseDesign } from './database-design';
import type { ApiDesign } from './api-design';
import type { ReviewReport } from './review';
import type { ProjectIdeaInput } from './pipeline';

/** The complete set of artifacts for a session (the JSON export). */
export interface ExportBundle {
  sessionId: string;
  generatedAt: string;
  idea: ProjectIdeaInput;
  requirements: RequirementDocument;
  systemDesign: SystemDesign;
  databaseDesign: DatabaseDesign;
  apiDesign: ApiDesign;
  /** Present only if the review has been run. */
  review: ReviewReport | null;
}

/** A single file in the generated GitHub project structure. */
export interface ProjectFile {
  /** Repo-relative path, e.g. "src/modules/auth/auth.module.ts". */
  path: string;
  /** Optional starter contents (often a stub/README). */
  contents?: string;
}

export interface ProjectStructure {
  sessionId: string;
  generatedAt: string;
  files: ProjectFile[];
}

export type ExportFormat = 'json' | 'markdown' | 'openapi' | 'structure';
