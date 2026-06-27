import { AgentRole, type ProjectIdeaInput } from '@archivato/shared';
import { BaseAgent } from '../agent.base';

/** The Product Analyst's structured read of a raw idea (Intent Analysis stage). */
export interface IntentAnalysis {
  summary: string;
  domain: string;
  primaryUsers: string[];
  coreCapabilities: string[];
  openQuestions: string[];
}

/**
 * Sample concrete agent, included in Slice 1 to exercise the LLM/Agent core
 * end-to-end. The full Intent Analysis prompt is refined in its own slice.
 */
export class ProductAnalystAgent extends BaseAgent {
  readonly role = AgentRole.ProductAnalyst;

  protected readonly systemPrompt = [
    'You are a seasoned Product Analyst.',
    'Given a raw business idea, extract a concise, structured intent analysis.',
    'You never invent product decisions; unknowns go into openQuestions.',
  ].join(' ');

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
