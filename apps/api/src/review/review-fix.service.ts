import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  appendFixLog,
  draftAssumption,
  draftClientQuestion,
  draftOutOfScope,
  findFindingById,
  FIX_ACTION_STATUS,
  PATCH_SECTIONS,
  patchSectionKeyFor,
  REVIEW_QUESTION_SLOT,
  stagesTouched,
  validateFixProposal,
  withFindingStatus,
  type FixAction,
  type FixLogEntry,
  type FixProposal,
  type FixResult,
  type PatchableStage,
  type PatchSection,
  type PatchSectionKey,
  type ReviewFinding,
  type ReviewReport,
} from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import type { InterviewSession } from '../interview/interview-session.entity';
import { RequirementsService } from '../requirements/requirements.service';
import { SystemDesignService } from '../system-design/system-design.service';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from '../requirements/requirement-document.repository';
import {
  SYSTEM_DESIGN_REPOSITORY,
  type SystemDesignRepository,
} from '../system-design/system-design.repository';
import { PatchAgent } from '../llm/agents/patch.agent';
import {
  REVIEW_REPORT_REPOSITORY,
  type ReviewReportRepository,
} from './review-report.repository';

/**
 * Turns review findings into applied fixes (R11).
 *
 * **The invariant this service exists to hold: no artifact is ever mutated without
 * an explicit, per-action approval from the owner.** `propose` is pure draft — it
 * calls the model and writes nothing. Every method that writes corresponds to a
 * button the owner pressed on a preview they were shown. There is deliberately no
 * "apply all findings" entry point, and `propose` has no write path at all, so an
 * approval step cannot be skipped by calling a different method.
 *
 * Downstream consistency is NOT handled here. Every write stamps a fresh
 * `generatedAt` on the artifact it touches, which is what the existing staleness
 * system (`freshness.ts`) compares — the derived stages flag themselves stale and
 * offer the one-click regenerate they already had. No new cascade.
 */
@Injectable()
export class ReviewFixService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REVIEW_REPORT_REPOSITORY)
    private readonly reports: ReviewReportRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirementDocs: RequirementDocumentRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly systemDesigns: SystemDesignRepository,
    private readonly requirements: RequirementsService,
    private readonly designs: SystemDesignService,
    private readonly patcher: PatchAgent,
  ) {}

  /**
   * Draft a fix for one or more findings. **Writes nothing** — the result is a
   * proposal the owner previews and then explicitly approves via `applyPatch`.
   *
   * Batching is allowed, but two findings whose patches would land on the same
   * section are rejected up front (`batch_conflict`): each patch is a
   * whole-section replacement drafted independently, so applying both would let
   * the second silently erase the first, and the owner would have approved a
   * preview showing a change that never landed. The UI drops to the per-finding
   * flow instead.
   */
  async propose(sessionId: string, findingIds: string[]): Promise<FixProposal> {
    if (findingIds.length === 0) {
      throw new BadRequestException('No findings selected.');
    }
    const session = await this.requireSession(sessionId);
    const report = await this.requireReport(sessionId);

    const findings = findingIds.map((id) => this.requireFinding(report, id));
    const keys = findings.map((finding) => this.requirePatchable(finding));

    const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
    if (duplicates.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'batch_conflict',
        message:
          'These findings would rewrite the same section. Fix them one at a time so each change is previewed against what is really there.',
        sections: [...new Set(duplicates)],
      });
    }

    const current = await this.readSections(sessionId, keys);
    const result = await this.patcher.propose({
      idea: session.input.idea,
      findings,
      sections: keys.map((key) => ({ key, current: current.get(key) })),
      slots: session.slots,
    });

    if (!result.ok) {
      // No fallback: a guessed rewrite of a client-facing document is worse than
      // an honest failure (the owner still has the finding). See PatchAgent.
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'patch_unavailable',
        message: "Couldn't generate a fix for this finding. Nothing was changed.",
        detail: result.detail,
      });
    }

    // The "before" side of the preview is the REAL artifact, read here — never the
    // model's description of it. The owner approves what they were shown.
    return {
      ...result.proposal,
      sections: result.proposal.sections.map((section) => ({
        ...section,
        currentContent: current.get(section.key),
      })),
    };
  }

  /**
   * Apply a proposal the owner approved. This is the only path that writes a
   * patch, and it re-validates the payload from scratch.
   *
   * The proposal round-trips through the browser rather than sitting in a
   * server-side cache, which is safe for one specific reason: the caller is the
   * session's owner (guarded), and an owner can already PUT any content they like
   * to these artifacts through the structured editors. So the risk here is a
   * malformed shape, not an untrusted author — and `validateFixProposal` is strict
   * about shape. What it must never become is a path that writes something the
   * owner did not see.
   */
  async applyPatch(sessionId: string, proposal: unknown): Promise<FixResult> {
    await this.requireSession(sessionId);
    const report = await this.requireReport(sessionId);

    const findingIds = this.readFindingIds(proposal);
    const findings = findingIds.map((id) => this.requireFinding(report, id));
    const targeted = new Set(findings.map((f) => this.requirePatchable(f)));

    const result = validateFixProposal(proposal, findingIds);
    if (!result.ok) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code:
          result.error === 'conflict' ? 'batch_conflict' : 'invalid_patch',
        message: 'That patch could not be applied. Nothing was changed.',
        detail: result.detail,
      });
    }
    const { sections } = result.proposal;

    // Every section must belong to one of the named findings. Without this, an
    // apply could rewrite one section while marking a different finding resolved
    // — the artifact would change and the fix log would describe something that
    // never happened. The log is only worth keeping if it can't lie.
    const stray = sections.find((section) => !targeted.has(section.key));
    if (stray) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'invalid_patch',
        message: 'That patch could not be applied. Nothing was changed.',
        detail: `${stray.key} is not the target of any named finding.`,
      });
    }

    // Every touched stage is written before anything is logged, so a failure
    // mid-way can't leave a log claiming a fix that isn't in the document.
    const touched = stagesTouched(sections);
    await this.writeStages(sessionId, sections, touched);

    return this.record(
      sessionId,
      report,
      findings.map((finding) => ({
        finding,
        action: 'patch_applied' as FixAction,
        artifactsTouched: touched,
      })),
    );
  }

  /**
   * Convert a `needs_client` finding into a question to forward to the client.
   * No LLM call — the text is the owner's, pre-filled from the finding and edited
   * before they confirmed.
   */
  async addClientQuestion(
    sessionId: string,
    findingId: string,
    question: string,
  ): Promise<FixResult> {
    await this.requireSession(sessionId);
    const report = await this.requireReport(sessionId);
    const finding = this.requireFinding(report, findingId);
    const text = this.requireText(question, () => draftClientQuestion(finding));

    await this.requirements.appendClientQuestion(
      sessionId,
      { slotKey: REVIEW_QUESTION_SLOT, questionForClient: text },
      draftAssumption(finding, text),
    );

    return this.record(sessionId, report, [
      {
        finding,
        action: 'added_open_question',
        artifactsTouched: ['requirements'],
      },
    ]);
  }

  /** Convert a `needs_client` finding into an out-of-scope line. No LLM call. */
  async addOutOfScope(
    sessionId: string,
    findingId: string,
    item: string,
    reason?: string,
  ): Promise<FixResult> {
    await this.requireSession(sessionId);
    const report = await this.requireReport(sessionId);
    const finding = this.requireFinding(report, findingId);
    const text = this.requireText(item, () => draftOutOfScope(finding));

    await this.requirements.appendOutOfScope(sessionId, {
      item: text,
      reason: reason?.trim() || undefined,
    });

    return this.record(sessionId, report, [
      {
        finding,
        action: 'added_out_of_scope',
        artifactsTouched: ['requirements'],
      },
    ]);
  }

  /**
   * Acknowledge or dismiss an advisory finding. Status + log only — nothing is
   * written to any artifact, so `artifactsTouched` is empty and no stage goes
   * stale.
   */
  async resolveAdvisory(
    sessionId: string,
    findingId: string,
    action: 'acknowledged' | 'dismissed',
    note?: string,
  ): Promise<FixResult> {
    await this.requireSession(sessionId);
    const report = await this.requireReport(sessionId);
    const finding = this.requireFinding(report, findingId);

    return this.record(sessionId, report, [
      { finding, action, artifactsTouched: [], note: note?.trim() || undefined },
    ]);
  }

  /** The session's append-only fix log, oldest first. */
  async fixLog(sessionId: string): Promise<FixLogEntry[]> {
    const session = await this.requireSession(sessionId);
    return session.fixLog ?? [];
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Persist the outcome of an approved action: move each finding's status and
   * append to the session's log. The two always move together — a status with no
   * log entry is an unexplained change, and a log entry with no status change is a
   * fix the UI keeps re-offering.
   */
  private async record(
    sessionId: string,
    report: ReviewReport,
    actions: {
      finding: ReviewFinding;
      action: FixAction;
      artifactsTouched: PatchableStage[];
      note?: string;
    }[],
  ): Promise<FixResult> {
    const at = new Date().toISOString();
    const session = await this.requireSession(sessionId);

    let next = report;
    let log = session.fixLog;
    for (const { finding, action, artifactsTouched, note } of actions) {
      next = withFindingStatus(
        next,
        finding.id!,
        FIX_ACTION_STATUS[action],
        note,
      );
      log = appendFixLog(log, {
        findingId: finding.id!,
        // Copied so the entry still reads after a re-run replaces the report and
        // the id points at nothing.
        findingTitle: finding.title,
        action,
        artifactsTouched,
        at,
        ...(note ? { note } : {}),
      });
    }

    const [review] = await Promise.all([
      this.reports.upsert(next),
      this.sessions.save({ ...session, fixLog: log ?? [] }),
    ]);

    return {
      review,
      fixLog: log ?? [],
      artifactsTouched: [...new Set(actions.flatMap((a) => a.artifactsTouched))],
    };
  }

  /** Route each stage's sections to the service that owns that artifact's writes. */
  private async writeStages(
    sessionId: string,
    sections: PatchSection[],
    touched: PatchableStage[],
  ): Promise<void> {
    for (const stage of touched) {
      if (stage === 'requirements') {
        await this.requirements.applyPatch(sessionId, sections);
      } else if (stage === 'system-design') {
        await this.designs.applyPatch(sessionId, sections);
      } else {
        // Unreachable: PATCH_SECTIONS only maps onto the two stages above, and
        // validateFixProposal rejects any other key. Loud rather than silent, so
        // widening PATCH_SECTIONS without adding a writer fails here instead of
        // quietly accepting a patch it then drops on the floor.
        throw new ConflictException(`No patch writer for stage "${stage}".`);
      }
    }
  }

  /** The artifacts' actual current content for each requested section. */
  private async readSections(
    sessionId: string,
    keys: PatchSectionKey[],
  ): Promise<Map<PatchSectionKey, unknown>> {
    const stages = new Set(keys.map((key) => PATCH_SECTIONS[key].stage));
    const [doc, design] = await Promise.all([
      stages.has('requirements')
        ? this.requirementDocs.findBySessionId(sessionId)
        : null,
      stages.has('system-design')
        ? this.systemDesigns.findBySessionId(sessionId)
        : null,
    ]);

    const out = new Map<PatchSectionKey, unknown>();
    for (const key of keys) {
      const spec = PATCH_SECTIONS[key];
      const artifact = spec.stage === 'requirements' ? doc : design;
      if (!artifact) {
        throw new ConflictException(
          `The ${spec.stage} artifact is missing; regenerate it before fixing this finding.`,
        );
      }
      out.set(key, (artifact as unknown as Record<string, unknown>)[spec.field]);
    }
    return out;
  }

  private readFindingIds(proposal: unknown): string[] {
    const raw = (proposal as { findingIds?: unknown } | null)?.findingIds;
    const ids = Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === 'string' && !!id)
      : [];
    if (ids.length === 0) {
      throw new BadRequestException('The patch names no findings.');
    }
    return ids;
  }

  private requireText(value: string, fallback: () => string): string {
    const text = value?.trim() || fallback().trim();
    if (!text) throw new BadRequestException('The text cannot be empty.');
    return text;
  }

  private requirePatchable(finding: ReviewFinding): PatchSectionKey {
    const key = patchSectionKeyFor(finding.patchTarget);
    if (finding.actionType !== 'patch' || !key) {
      throw new ConflictException(
        `"${finding.title}" cannot be fixed by rewriting a single section.`,
      );
    }
    return key;
  }

  private requireFinding(report: ReviewReport, id: string): ReviewFinding {
    const finding = findFindingById(report, id);
    if (!finding) {
      throw new NotFoundException(`No finding "${id}" in this review.`);
    }
    return finding;
  }

  private async requireReport(sessionId: string): Promise<ReviewReport> {
    const report = await this.reports.findBySessionId(sessionId);
    if (!report) {
      throw new ConflictException(
        'Run the review before acting on its findings.',
      );
    }
    return report;
  }

  private async requireSession(sessionId: string): Promise<InterviewSession> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    return session;
  }
}
