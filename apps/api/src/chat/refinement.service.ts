import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ChatMessage, RefineResult } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import {
  REQUIREMENT_DOCUMENT_REPOSITORY,
  type RequirementDocumentRepository,
} from '../requirements/requirement-document.repository';
import {
  API_DESIGN_REPOSITORY,
  type ApiDesignRepository,
} from '../api-design/api-design.repository';
import {
  REVIEW_REPORT_REPOSITORY,
  type ReviewReportRepository,
} from '../review/review-report.repository';
import { SystemDesignService } from '../system-design/system-design.service';
import { DatabaseDesignService } from '../database-design/database-design.service';
import { ApiDesignService } from '../api-design/api-design.service';
import { ReviewService } from '../review/review.service';
import { RefinementAgent } from '../llm/agents/refinement.agent';
import { VersionsService } from '../versions/versions.service';
import {
  CHAT_MESSAGE_REPOSITORY,
  type ChatMessageRepository,
} from './chat-message.repository';

/**
 * Post-generation AI chat (Slice 10). A natural-language instruction amends the
 * Requirement Document; the downstream stages (system → database → API, and the
 * review if one exists) are then regenerated from it so the whole design stays
 * consistent. The conversation is persisted.
 */
@Injectable()
export class RefinementService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(REQUIREMENT_DOCUMENT_REPOSITORY)
    private readonly requirements: RequirementDocumentRepository,
    @Inject(API_DESIGN_REPOSITORY)
    private readonly apiDesigns: ApiDesignRepository,
    @Inject(REVIEW_REPORT_REPOSITORY)
    private readonly reviews: ReviewReportRepository,
    @Inject(CHAT_MESSAGE_REPOSITORY)
    private readonly chat: ChatMessageRepository,
    private readonly refiner: RefinementAgent,
    private readonly systemDesign: SystemDesignService,
    private readonly databaseDesign: DatabaseDesignService,
    private readonly apiDesign: ApiDesignService,
    private readonly review: ReviewService,
    private readonly versions: VersionsService,
  ) {}

  /** Apply one chat instruction and regenerate the affected design artifacts. */
  async refine(sessionId: string, instruction: string): Promise<RefineResult> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException('Refinement requires a confirmed interview.');
    }

    const current = await this.requirements.findBySessionId(sessionId);
    // Chat is only available once a full design exists (through the API stage).
    if (!current || !(await this.apiDesigns.findBySessionId(sessionId))) {
      throw new ConflictException(
        'Generate the full design (through the API stage) before chatting.',
      );
    }

    // 1) Amend the requirements from the instruction.
    const { document, summary } = await this.refiner.refine(sessionId, {
      instruction,
      current,
      idea: session.input.idea,
      intent: session.intent,
    });
    await this.requirements.upsert(document);

    // 2) Regenerate downstream so everything stays consistent.
    const systemDesign = await this.systemDesign.generate(sessionId);
    const databaseDesign = await this.databaseDesign.generate(sessionId);
    const apiDesign = await this.apiDesign.generate(sessionId);
    // Only refresh the review if the user had already run one.
    const hadReview = await this.reviews.findBySessionId(sessionId);
    const reviewReport = hadReview ? await this.review.generate(sessionId) : null;

    // 3) Record a new project version capturing the whole refinement.
    await this.versions.snapshot(sessionId, `refine: ${truncate(instruction)}`);

    // 4) Persist the conversation turn.
    await this.chat.create({ sessionId, role: 'user', content: instruction });
    await this.chat.create({ sessionId, role: 'assistant', content: summary });
    const messages = await this.chat.listBySession(sessionId);

    return {
      messages,
      requirementDocument: document,
      systemDesign,
      databaseDesign,
      apiDesign,
      reviewReport,
    };
  }

  /** The saved conversation for a session (oldest first). */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    return this.chat.listBySession(sessionId);
  }
}

/** Keep version labels short and readable. */
function truncate(text: string, max = 60): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
