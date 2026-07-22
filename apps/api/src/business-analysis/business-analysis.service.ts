import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { BusinessAnalysis, SlotMap } from '@archivato/shared';
import {
  businessAnalysisInputsFingerprint,
  carryOverFacts,
  diffBusinessAnalysisFacts,
} from '@archivato/shared';
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
  private readonly logger = new Logger(BusinessAnalysisService.name);

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
   *
   * Re-run behaviour: the competitor and market FACTS are pinned across runs on
   * the same interview, so a regenerate rewrites the framing without reshuffling
   * the client-facing facts (`carryOverFacts`). `refreshFacts` opts out — the one
   * explicit way to re-research. Either way the factual delta is logged, so a
   * change is never silent.
   */
  async generate(
    sessionId: string,
    opts: { refreshFacts?: boolean } = {},
  ): Promise<BusinessAnalysis> {
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

    const fingerprint = businessAnalysisInputsFingerprint({
      idea: session.input.idea,
      industry: session.input.industry,
      domain: session.intent?.domain,
      goal: session.summary.goal,
      features: session.summary.features,
      slots: slotValues(session.slots ?? undefined),
    });

    const previous = await this.analyses.findBySessionId(sessionId);

    const fresh = await this.analyst.generate(sessionId, {
      idea: session.input.idea,
      industry: session.input.industry,
      intent: session.intent,
      summary: session.summary,
      slots: session.slots ?? undefined,
    });

    // Reuse the stored facts only when this is genuinely the same interview and
    // the caller didn't ask to re-research — different inputs are a different
    // project and get fresh facts. A pre-existing row has no fingerprint, so it
    // never matches and always re-researches once; from then on it is pinned.
    const reuse =
      !opts.refreshFacts &&
      !!previous &&
      previous.inputsFingerprint === fingerprint;

    const analysis: BusinessAnalysis = {
      ...(reuse ? carryOverFacts(fresh, previous) : fresh),
      inputsFingerprint: fingerprint,
    };

    const diff = diffBusinessAnalysisFacts(previous, analysis);
    if (previous && !diff.stable) {
      // Surfaced, not silent: a re-run that moved a client-facing fact says which.
      this.logger.log(
        `Business analysis ${sessionId} facts changed on re-run ` +
          `(refreshFacts=${!!opts.refreshFacts}): ` +
          `+[${diff.competitorsAdded.join(', ')}] -[${diff.competitorsRemoved.join(', ')}] ` +
          `market=${diff.marketSignalsChanged ? 'changed' : 'same'}`,
      );
    } else if (reuse) {
      this.logger.debug(
        `Business analysis ${sessionId} re-run reused pinned facts (stable).`,
      );
    }

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

/** Flatten the slot snapshot to `{key: value}` for the inputs fingerprint. */
function slotValues(slots: SlotMap | undefined): Record<string, string> {
  if (!slots) return {};
  const out: Record<string, string> = {};
  for (const [key, slot] of Object.entries(slots)) {
    if (typeof slot?.value === 'string') out[key] = slot.value;
  }
  return out;
}
