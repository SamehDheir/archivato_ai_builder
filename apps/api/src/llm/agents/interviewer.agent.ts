import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  type InterviewExchange,
  type IntentAnalysis,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import {
  INTERVIEW_LLM_PROVIDER,
  type LlmProvider,
} from '../llm-provider.interface';

/** What the interviewer needs to choose the next question. */
export interface InterviewerContext {
  idea: string;
  intent: IntentAnalysis | null;
  history: InterviewExchange[];
  /** Language to ask in — `'ar'` makes the question + options Arabic. */
  language?: 'ar' | 'en';
}

/** The interviewer's decision for one turn. */
export interface InterviewerDecision {
  /** True when enough has been gathered to design a strong system. */
  done: boolean;
  /** Estimated requirement coverage, 0..1 (drives the progress bar). */
  coverage: number;
  /** Suggested phase for the next question (free text; validated by caller). */
  phase?: string;
  /** The next question to ask; omitted when done. */
  question?: string;
  /** Optional tap-to-pick answer choices for a closed question. */
  options?: string[];
  /** Whether several options can be picked at once (checkboxes vs one choice). */
  multiple?: boolean;
}

/**
 * Owns the ADAPTIVE interview (real-AI path). Given the concept and the answers
 * so far, it decides the single most valuable next question — tailored to this
 * specific idea — or signals that it has enough.
 *
 * Uses INTERVIEW_LLM_PROVIDER so the interview can run on a real model (Groq)
 * while the rest of the pipeline stays on the default provider. There is no
 * fallback here: `InterviewService` reverts to the deterministic question plan
 * when this agent fails or returns something malformed (e.g. in mock mode).
 */
@Injectable()
export class InterviewerAgent extends BaseAgent {
  readonly role = AgentRole.Interviewer;

  protected readonly systemPrompt = [
    'You are an expert software requirements interviewer — a business analyst who',
    'elicits exactly what is needed to design a strong system, and nothing more.',
    'You ask ONE sharp, specific question at a time, tailored to THIS concept.',
    'Across the interview you cover the goal, users/roles, the core workflow,',
    'business rules, key features, scale, and technical preferences — but you skip',
    'whatever is irrelevant to this idea, and you probe vague or incomplete',
    'answers instead of moving on. You never bundle two questions into one, never',
    'ask what the user already answered, and never ask for information the concept',
    'already makes obvious.',
    'Keep the interview SHORT: at most 9 questions total, and fewer is better —',
    'stop the moment you have enough to design a strong, accurate system.',
    'For closed questions (scale, tech choice, yes/no, categories) offer a few',
    'short, mutually distinct tap-to-pick options so answering is one tap; set',
    'multiple=true when several can genuinely apply (e.g. roles, notification',
    'channels). Omit options for open-ended questions like the goal or workflow.',
    'Output standard: the question must be concrete and unambiguous, the coverage',
    'estimate honest, and the JSON strictly valid. Always write the question and',
    'all options in the SAME language the user used for their idea and answers',
    '(an Arabic idea gets Arabic questions).',
  ].join(' ');

  constructor(@Inject(INTERVIEW_LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async decide(ctx: InterviewerContext): Promise<InterviewerDecision> {
    // Slightly creative so questions read naturally, but still JSON-constrained.
    return this.thinkJson<InterviewerDecision>(this.buildPrompt(ctx), {
      temperature: 0.4,
    });
  }

  private buildPrompt(ctx: InterviewerContext): string {
    const qa =
      ctx.history.length > 0
        ? ctx.history
            .map((h, i) => `${i + 1}. Q: ${h.question.prompt}\n   A: ${h.answer}`)
            .join('\n')
        : '(no questions answered yet)';

    const arabic =
      ctx.language === 'ar'
        ? 'IMPORTANT: The user wrote in Arabic. Write "question" and every ' +
          'string in "options" ENTIRELY in Arabic (Modern Standard Arabic). ' +
          'Keep the "phase" value as the given English enum key.'
        : '';

    return [
      arabic,
      `Concept: ${ctx.idea}`,
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      ctx.intent && ctx.intent.openQuestions.length
        ? `Known open questions to resolve: ${ctx.intent.openQuestions.join('; ')}`
        : '',
      '',
      'Conversation so far:',
      qa,
      '',
      'Decide the single most valuable NEXT question that closes the biggest',
      'remaining gap in understanding this specific concept, so a strong, accurate',
      'system can be designed. Prefer questions that unblock design decisions over',
      'nice-to-know detail. If the answers so far are enough to design a strong',
      'system, set done=true and omit the question.',
      '',
      'Return JSON:',
      '- "done": boolean — true only when further questions would not improve the design.',
      '- "coverage": number 0..1 — your honest estimate of how complete the requirements now are.',
      '- "phase": one of ["understanding","business_logic","features","scale","technical"].',
      '- "question": string — the single next question (omit when done).',
      '- "options"?: array of up to 5 short, distinct answer choices (only for closed questions).',
      '- "multiple"?: boolean — true when more than one option can apply.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
