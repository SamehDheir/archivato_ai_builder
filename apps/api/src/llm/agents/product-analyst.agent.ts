import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  type IntentAnalysis,
  type ProjectIdeaInput,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

export type { IntentAnalysis };

/**
 * Owns the Intent Analysis stage: turns a raw idea into a structured read of
 * domain, users, capabilities, and the open questions the interview must close.
 */
@Injectable()
export class ProductAnalystAgent extends BaseAgent {
  readonly role = AgentRole.ProductAnalyst;

  protected readonly systemPrompt = [
    'You are a seasoned Product Analyst.',
    'Given a raw business idea, extract a concise, structured intent analysis.',
    'You never invent product decisions; unknowns go into openQuestions.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async analyze(input: ProjectIdeaInput): Promise<IntentAnalysis> {
    const prompt = [
      `Business idea: ${input.idea}`,
      input.industry ? `Industry: ${input.industry}` : '',
      input.scale ? `Scale: ${input.scale}` : '',
      input.preferredStack ? `Preferred stack: ${input.preferredStack}` : '',
      '',
      'Return JSON with keys: summary, domain, primaryUsers[], ' +
        'coreCapabilities[], openQuestions[].',
    ]
      .filter(Boolean)
      .join('\n');

    return this.thinkJson<IntentAnalysis>(prompt);
  }
}
