import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  appendProposalDraft,
  buildEffortEstimate,
  isOverLength,
  proposalCharCount,
  PROPOSAL_CEILINGS,
  resolveProposalLocale,
  sharePath,
  topCapabilities,
  type ProjectRoadmap,
  type ProposalDraft,
  type ProposalFacts,
  type ProposalInput,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import type { InterviewSession } from '../interview/interview-session.entity';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from '../requirements/requirement-document.repository';
import {
  SYSTEM_DESIGN_REPOSITORY,
  type SystemDesignRepository,
} from '../system-design/system-design.repository';
import {
  API_DESIGN_REPOSITORY,
  type ApiDesignRepository,
} from '../api-design/api-design.repository';
import {
  PROJECT_ROADMAP_REPOSITORY,
  type ProjectRoadmapRepository,
} from '../roadmap/roadmap.repository';
import { ShareService } from '../share/share.service';
import { ProposalWriterAgent } from '../llm/agents/proposal-writer.agent';
import type { GenerateProposalDto } from './dto/generate-proposal.dto';

/**
 * Writes the covering message that carries a scoping into a bid (R13).
 *
 * **Owner-only, end to end.** Nothing here touches the public share payload: the
 * drafts live on the session (never projected), and the message itself is the
 * owner's to send — we only ever hand it back to them.
 *
 * Standalone, like the roadmap and the cost estimate: it reads the finished
 * pipeline and gates nothing.
 */
@Injectable()
export class ProposalService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirements: RequirementDocumentRepository,
    @Inject(SYSTEM_DESIGN_REPOSITORY)
    private readonly systemDesigns: SystemDesignRepository,
    @Inject(API_DESIGN_REPOSITORY)
    private readonly apiDesigns: ApiDesignRepository,
    @Inject(PROJECT_ROADMAP_REPOSITORY)
    private readonly roadmaps: ProjectRoadmapRepository,
    private readonly share: ShareService,
    private readonly writer: ProposalWriterAgent,
    private readonly config: ConfigService,
  ) {}

  /**
   * Draft a message and store it in the project's history.
   *
   * Requires the full pipeline: the message's credibility rests on the scoping
   * being complete — an effort range and a link to a half-built page is a worse
   * bid than one the owner writes themselves.
   */
  async generate(
    sessionId: string,
    controls: GenerateProposalDto,
  ): Promise<ProposalDraft> {
    const session = await this.requireSession(sessionId);
    if (session.status !== 'confirmed') {
      throw new ConflictException('The proposal needs a confirmed interview.');
    }

    const [requirements, systemDesign, apiDesign, roadmap] = await Promise.all([
      this.requirements.findBySessionId(sessionId),
      this.systemDesigns.findBySessionId(sessionId),
      this.apiDesigns.findBySessionId(sessionId),
      this.roadmaps.findBySessionId(sessionId),
    ]);
    if (!apiDesign || !requirements || !systemDesign) {
      throw new ConflictException(
        'Complete the design through the API design before writing the proposal.',
      );
    }

    // Minting here is deliberate. `create` is idempotent, so a link already sitting
    // in a client's inbox is returned untouched and never rotated — and an owner
    // asking for the message that says "the full scoping is here: <link>" is
    // unambiguously about to send that link. Requiring them to go mint it first
    // would be a step that exists only to make the code feel side-effect-free.
    const link = await this.share.create(sessionId);
    const shareUrl = `${this.webOrigin()}${sharePath(link.token)}`;

    const channel = controls.channel;
    const locale = resolveProposalLocale(
      channel,
      controls.locale,
      controls.projectLocale,
    );

    const input: ProposalInput = {
      channel,
      locale,
      // Only what the owner confirmed in the form — deliberately NOT defaulted
      // from `session.clientName`. The session's client name is a dashboard label
      // that no agent reads, and the web already prefills this field from it, so a
      // silent server-side fallback would add nothing except a path by which that
      // label reaches a prompt without the owner seeing it happen. Here they see
      // the name in the box and can clear it.
      clientName: trimmed(controls.clientName),
      senderName: trimmed(controls.senderName),
      companyName: trimmed(controls.companyName),
      // The price is dropped unless the owner explicitly opted in. This is the
      // enforcement — not a prompt instruction: the agent cannot state a figure it
      // was never handed, so a stale value left in the form is unreachable.
      ...(controls.includePrice && trimmed(controls.price)
        ? { price: trimmed(controls.price) }
        : {}),
      customHook: trimmed(controls.customHook),
      variant: controls.variant ?? 0,
      facts: this.buildFacts({ session, requirements, systemDesign, roadmap, shareUrl }),
    };

    const { message, source } = await this.writer.write(input);

    const draft: ProposalDraft = {
      id: randomUUID(),
      channel,
      locale,
      message,
      charCount: proposalCharCount(message),
      ceiling: PROPOSAL_CEILINGS[channel],
      // Warned, never cut: the agent already spent its one shorten retry, and a
      // message truncated at the ceiling ends mid-thought — the owner asked for
      // something ready to send and may not re-read it.
      overLength: isOverLength(message, channel),
      shareUrl,
      includedPrice: !!input.price,
      source,
      createdAt: new Date().toISOString(),
    };

    // Re-read before writing. `save()` persists the WHOLE row, and the model call
    // above is the longest window in the app — several seconds during which the
    // owner can rename the project, set a weekly rate, or apply a review fix from
    // another tab. Writing back the snapshot taken before the call would silently
    // revert any of them. Only the drafts column is ours to move (the R11 `record`
    // precedent, which re-reads for exactly this reason).
    const current = await this.requireSession(sessionId);
    await this.sessions.save({
      ...current,
      proposalDrafts: appendProposalDraft(current.proposalDrafts, draft),
    });
    return draft;
  }

  /** The project's drafts, newest first (at most `PROPOSAL_DRAFT_LIMIT`). */
  async history(sessionId: string): Promise<ProposalDraft[]> {
    const session = await this.requireSession(sessionId);
    return session.proposalDrafts ?? [];
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * The scoping facts the message is written from. Everything optional degrades
   * cleanly: no roadmap ⇒ no MVP line, no timeline slot ⇒ no timeline mention.
   *
   * Effort is recomputed with `buildEffortEstimate` rather than read from a stored
   * cost estimate, for the same reason the roadmap does it: it is deterministic
   * from the design, so it is always available and can never be a stale figure the
   * owner would then quote to a client.
   */
  private buildFacts(ctx: {
    session: InterviewSession;
    requirements: RequirementDocument;
    systemDesign: SystemDesign;
    roadmap: ProjectRoadmap | null;
    shareUrl: string;
  }): ProposalFacts {
    const { session, requirements, systemDesign, roadmap, shareUrl } = ctx;
    const effort = buildEffortEstimate(systemDesign);
    const timelineSlot = session.slots?.timeline;

    return {
      title: session.title ?? session.input.idea,
      idea: session.input.idea,
      executiveSummary: requirements.executiveSummary,
      capabilities: topCapabilities(requirements.functional),
      effortWeeksMin: effort.weeksMin,
      effortWeeksMax: effort.weeksMax,
      // `phases?.` and not just `roadmap?.`: the roadmap comes back from a JSON
      // column through a cast, which is a claim rather than a check — a row stored
      // before a rule existed can violate the type it is cast to. A missing array
      // must read as absent, never blow up a stage that merely wanted one line.
      mvpStatement: roadmap?.phases?.find((p) => p.isMvp)?.mvpStatement,
      timeline:
        timelineSlot && !timelineSlot.na ? timelineSlot.value : undefined,
      shareUrl,
    };
  }

  private webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  private async requireSession(sessionId: string): Promise<InterviewSession> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    return session;
  }
}

/** A non-empty trimmed string, or undefined. */
function trimmed(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}
