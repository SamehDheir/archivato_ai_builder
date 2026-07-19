import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BusinessAnalysis } from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { BusinessAnalystAgent } from '../llm/agents/business-analyst.agent';
import {
  BUSINESS_ANALYSIS_REPOSITORY,
  type BusinessAnalysisRepository,
} from './business-analysis.repository';

@Injectable()
export class BusinessAnalysisService {
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY)
    private readonly analyses: BusinessAnalysisRepository,
    private readonly analyst: BusinessAnalystAgent,
  ) {}

  /**
   * Generate (or regenerate) the business analysis. Requires only a confirmed
   * interview — it sits ahead of the Requirement Document and feeds it, but
   * deliberately does **not** gate it (see `RequirementsService.generate`).
   */
  async generate(sessionId: string): Promise<BusinessAnalysis> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Interview session ${sessionId} not found.`);
    }
    if (session.status !== 'confirmed') {
      throw new ConflictException(
        'The business analysis requires a confirmed interview.',
      );
    }
    if (!session.summary) {
      throw new ConflictException('Session has no requirements summary.');
    }

    const analysis = await this.analyst.generate(sessionId, {
      idea: session.input.idea,
      industry: session.input.industry,
      intent: session.intent,
      summary: session.summary,
      slots: session.slots ?? undefined,
    });

    return this.analyses.upsert(analysis);
  }

  async get(sessionId: string): Promise<BusinessAnalysis> {
    const analysis = await this.analyses.findBySessionId(sessionId);
    if (!analysis) {
      throw new NotFoundException(
        `No business analysis for session ${sessionId}. Generate it first.`,
      );
    }
    return analysis;
  }
}
