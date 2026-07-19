import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  type IntentAnalysis,
  type ProjectIdeaInput,
  untrustedField,
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
    'You are a senior Product Analyst who scopes new software products for a',
    'living. From a raw business idea, produce a precise, structured intent',
    'analysis a requirements interview can build on: the problem domain, who the',
    'product serves, the core capabilities it must provide, and the decisions',
    'still unknown.',
    'Principles: infer only what the idea reasonably implies; never invent product',
    'decisions, pricing, timelines, or scope — genuine unknowns belong in',
    'openQuestions, not in fabricated answers.',
    'Output standard: every item must be specific to THIS idea (no generic',
    'filler), phrased in precise industry-standard terminology, short, and',
    'distinct from the others. Return ONLY strict JSON matching the requested',
    'schema, with every field populated.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async analyze(input: ProjectIdeaInput): Promise<IntentAnalysis> {
    const prompt = [
      untrustedField('Business idea', input.idea),
      input.industry ? `Stated industry: ${input.industry}` : '',
      input.scale ? `Target scale: ${input.scale}` : '',
      input.preferredStack ? `Preferred stack: ${input.preferredStack}` : '',
      '',
      'Analyze the idea and return JSON with these keys:',
      '- summary: one crisp sentence naming what the product is and the value it delivers.',
      '- domain: the specific industry / problem domain (e.g. "healthcare scheduling", "B2B logistics").',
      '- primaryUsers: the distinct user types or roles who will use it.',
      '- coreCapabilities: the essential capabilities the product must provide to be viable.',
      '- openQuestions: the most important unknowns a requirements interview must resolve before design.',
    ]
      .filter(Boolean)
      .join('\n');

    return this.thinkJson<IntentAnalysis>(prompt);
  }
}
