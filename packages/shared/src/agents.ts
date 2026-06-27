/**
 * The specialized AI agents that own pipeline stages. Each agent is a thin,
 * single-responsibility role driven by an LLM with a structured-output contract.
 */
export enum AgentRole {
  ProductAnalyst = 'product_analyst',
  RequirementEngineer = 'requirement_engineer',
  SystemArchitect = 'system_architect',
  DatabaseDesigner = 'database_designer',
  ApiDesigner = 'api_designer',
  Reviewer = 'reviewer',
}

/** A single turn in an LLM conversation. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options accepted by an LLM completion call. */
export interface LlmCompleteOptions {
  /** Overrides the provider's default model id. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** System prompt; merged ahead of `messages` when supported. */
  system?: string;
}
