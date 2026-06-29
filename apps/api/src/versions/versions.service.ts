import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  ProjectSnapshot,
  ProjectVersionDetail,
  ProjectVersionMeta,
} from '@archivato/shared';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from '../requirements/requirement-document.repository';
import {
  SYSTEM_DESIGN_REPOSITORY,
  type SystemDesignRepository,
} from '../system-design/system-design.repository';
import {
  DATABASE_DESIGN_REPOSITORY,
  type DatabaseDesignRepository,
} from '../database-design/database-design.repository';
import {
  API_DESIGN_REPOSITORY,
  type ApiDesignRepository,
} from '../api-design/api-design.repository';
import {
  REVIEW_REPORT_REPOSITORY,
  type ReviewReportRepository,
} from '../review/review-report.repository';
import {
  PROJECT_VERSION_REPOSITORY,
  type ProjectVersionRecord,
  type ProjectVersionRepository,
} from './project-version.repository';

/**
 * Project version history. `snapshot()` is called after every modification (a
 * stage generation by the job worker, or a chat refinement) to capture all
 * artifacts as the next sequential version. Versions can be listed, fetched for
 * comparison, and restored.
 */
@Injectable()
export class VersionsService {
  private readonly logger = new Logger(VersionsService.name);

  constructor(
    @Inject(PROJECT_VERSION_REPOSITORY)
    private readonly repo: ProjectVersionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirements: RequirementDocumentRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly systemDesigns: SystemDesignRepository,
    @Inject(DATABASE_DESIGN_REPOSITORY)
    private readonly databaseDesigns: DatabaseDesignRepository,
    @Inject(API_DESIGN_REPOSITORY)
    private readonly apiDesigns: ApiDesignRepository,
    @Inject(REVIEW_REPORT_REPOSITORY)
    private readonly reviews: ReviewReportRepository,
  ) {}

  /**
   * Capture the project's current artifacts as the next version. No-op if there
   * is nothing generated yet, or if nothing changed since the latest version
   * (deterministic regeneration would otherwise create duplicate versions).
   */
  async snapshot(sessionId: string, label: string): Promise<void> {
    const snapshot = await this.currentSnapshot(sessionId);
    if (isEmpty(snapshot)) return;

    const latest = await this.repo.latestBySession(sessionId);
    if (latest && stableEqual(latest.snapshot, snapshot)) return;

    const version = (latest?.version ?? 0) + 1;
    await this.repo.create({ sessionId, version, label, snapshot });
    this.logger.log(`Saved version ${version} for session ${sessionId}: ${label}`);
  }

  /** Version history (newest first), without the heavy snapshot payloads. */
  async list(sessionId: string): Promise<ProjectVersionMeta[]> {
    const rows = await this.repo.listBySession(sessionId);
    return rows.map(toMeta);
  }

  /** A single version with its full snapshot (for compare / restore). */
  async get(sessionId: string, version: number): Promise<ProjectVersionDetail> {
    const row = await this.requireVersion(sessionId, version);
    return { ...toMeta(row), snapshot: row.snapshot };
  }

  /**
   * Restore the project to a version: every artifact is overwritten with the
   * snapshot's content, and artifacts absent in the snapshot are removed, so the
   * project matches that version exactly. The restore is itself recorded as a
   * new version (history is never destroyed).
   */
  async restore(sessionId: string, version: number): Promise<ProjectSnapshot> {
    const target = await this.requireVersion(sessionId, version);
    await this.applySnapshot(sessionId, target.snapshot);
    await this.snapshot(sessionId, `restore v${version}`);
    return target.snapshot;
  }

  // ── internals ─────────────────────────────────────────────────────────

  private async requireVersion(
    sessionId: string,
    version: number,
  ): Promise<ProjectVersionRecord> {
    const row = await this.repo.findBySessionAndVersion(sessionId, version);
    if (!row) {
      throw new NotFoundException(
        `Version ${version} not found for session ${sessionId}.`,
      );
    }
    return row;
  }

  private async currentSnapshot(sessionId: string): Promise<ProjectSnapshot> {
    const [requirements, systemDesign, databaseDesign, apiDesign, review] =
      await Promise.all([
        this.requirements.findBySessionId(sessionId),
        this.systemDesigns.findBySessionId(sessionId),
        this.databaseDesigns.findBySessionId(sessionId),
        this.apiDesigns.findBySessionId(sessionId),
        this.reviews.findBySessionId(sessionId),
      ]);
    return { requirements, systemDesign, databaseDesign, apiDesign, review };
  }

  private async applySnapshot(
    sessionId: string,
    snapshot: ProjectSnapshot,
  ): Promise<void> {
    await Promise.all([
      snapshot.requirements
        ? this.requirements.upsert(snapshot.requirements)
        : this.requirements.deleteBySessionId(sessionId),
      snapshot.systemDesign
        ? this.systemDesigns.upsert(snapshot.systemDesign)
        : this.systemDesigns.deleteBySessionId(sessionId),
      snapshot.databaseDesign
        ? this.databaseDesigns.upsert(snapshot.databaseDesign)
        : this.databaseDesigns.deleteBySessionId(sessionId),
      snapshot.apiDesign
        ? this.apiDesigns.upsert(snapshot.apiDesign)
        : this.apiDesigns.deleteBySessionId(sessionId),
      snapshot.review
        ? this.reviews.upsert(snapshot.review)
        : this.reviews.deleteBySessionId(sessionId),
    ]);
  }
}

function toMeta(row: ProjectVersionRecord): ProjectVersionMeta {
  return {
    id: row.id,
    sessionId: row.sessionId,
    version: row.version,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

function isEmpty(snapshot: ProjectSnapshot): boolean {
  return (
    !snapshot.requirements &&
    !snapshot.systemDesign &&
    !snapshot.databaseDesign &&
    !snapshot.apiDesign &&
    !snapshot.review
  );
}

/** Cheap structural equality — artifacts are produced by deterministic builders. */
function stableEqual(a: ProjectSnapshot, b: ProjectSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
