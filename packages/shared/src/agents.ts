/**
 * The specialized AI agents that own pipeline stages. Each agent is a thin,
 * single-responsibility role driven by an LLM with a structured-output contract.
 */
export enum AgentRole {
  ProductAnalyst = 'product_analyst',
  /** Drives the adaptive interview — picks the next question from the concept. */
  Interviewer = 'interviewer',
  RequirementEngineer = 'requirement_engineer',
  SystemArchitect = 'system_architect',
  DatabaseDesigner = 'database_designer',
  ApiDesigner = 'api_designer',
  Reviewer = 'reviewer',
  /** Frames the product like a PM: vision, goals, MVP, roadmap, metrics, personas. */
  ProductManager = 'product_manager',
  /** Sequences the build into phased milestones + tasks (implementation roadmap). */
  RoadmapPlanner = 'roadmap_planner',
  /** Applies post-generation chat instructions by amending the requirements. */
  Refiner = 'refiner',
  /** Customer Support Assistant: deflection, in-ticket analysis, admin copilot. */
  SupportAssistant = 'support_assistant',
  /** Explains a single architecture decision on demand (rationale/tradeoffs). */
  ArchitectExplainer = 'architect_explainer',
  /** STRIDE security threat model of the generated design. */
  ThreatModeler = 'threat_modeler',
  /** Structured test / QA plan derived from the generated design. */
  QaPlanner = 'qa_planner',
  /** Drafts a targeted fix for a review finding, for the owner to approve (R11). */
  Patcher = 'patcher',
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
