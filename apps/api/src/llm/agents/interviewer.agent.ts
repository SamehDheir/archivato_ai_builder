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
    'You are an expert software requirements interviewer.',
    'You ask one sharp, specific question at a time, tailored to the concept.',
    'You cover goal, users/roles, core workflow, business rules, key features,',
    'scale, and tech preferences — but skip what is irrelevant to THIS idea and',
    'probe vague or incomplete answers. You never ask two things at once.',
    'Keep the interview SHORT: at most 9 questions total, fewer is better — stop',
    'as soon as you can design a strong system. For closed questions (scale, tech',
    'choice, yes/no, categories) offer a few short tap-to-pick options to make',
    'answering easy; use multiple=true when several can apply (e.g. roles,',
    'notifications). Omit options for open-ended questions like goal or workflow.',
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

    return [
      `Concept: ${ctx.idea}`,
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      '',
      'Conversation so far:',
      qa,
      '',
      'Decide the single most valuable NEXT question to deeply understand this',
      'specific concept so a strong, accurate system can be designed. If you',
      'already have enough, set done=true.',
      '',
      'Return JSON: { "done": boolean, "coverage": number between 0 and 1, ' +
        '"phase": one of ["understanding","business_logic","features","scale",' +
        '"technical"], "question": string (omit when done), "options"?: array ' +
        'of up to 5 short answer choices, "multiple"?: boolean }.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
