/**
 * The System Design — output of the System Architect stage (spec Step 4).
 * Produced from a confirmed interview + its Requirement Document.
 */

import type { GenerationProvenance } from './generation';

export type ArchitectureType =
  | 'monolith'
  | 'modular_monolith'
  | 'microservices';

export interface TechChoice {
  /** backend | frontend | database | cache | queue | auth | … */
  layer: string;
  technology: string;
  rationale: string;
}

/** Rough build effort of a module (R8), coarse t-shirt sizes. */
export type ModuleComplexity = 'S' | 'M' | 'L' | 'XL';

/** Stable order for rendering / validation. */
export const MODULE_COMPLEXITIES: readonly ModuleComplexity[] = [
  'S',
  'M',
  'L',
  'XL',
] as const;

export function isModuleComplexity(value: string): value is ModuleComplexity {
  return (MODULE_COMPLEXITIES as readonly string[]).includes(value);
}

export interface ServiceModule {
  /** e.g. Auth, Users, Billing, Notifications. */
  name: string;
  responsibility: string;
  /** Names of other services this one depends on. */
  dependencies: string[];
  /**
   * Rough build effort (R8), groundwork for a later effort estimate. Optional so
   * old rows and plan-mode runs render fine; generation always fills it (the LLM
   * path is backfilled, the fallback derives it from a heuristic).
   */
  complexity?: ModuleComplexity;
  /** One-line justification for the complexity rating. */
  complexityRationale?: string;
}

/** Whether a capability is best built in-house or bought from a service (R8). */
export type BuildVsBuyRecommendation = 'build' | 'buy';

/**
 * The standard capabilities the build-vs-buy analysis reasons about. A closed
 * set so the edit DTO can reject an unknown capability and the agent can
 * allowlist LLM output against it.
 */
export const BUILD_VS_BUY_CAPABILITIES = [
  'auth',
  'payments',
  'notifications',
  'file_storage',
  'maps_geo',
  'search',
] as const;

export type BuildVsBuyCapability = (typeof BUILD_VS_BUY_CAPABILITIES)[number];

export function isBuildVsBuyCapability(
  value: string,
): value is BuildVsBuyCapability {
  return (BUILD_VS_BUY_CAPABILITIES as readonly string[]).includes(value);
}

export interface BuildVsBuyItem {
  capability: BuildVsBuyCapability;
  recommendation: BuildVsBuyRecommendation;
  /** A concrete, well-known service to use when recommending "buy". */
  suggestedService?: string;
  rationale: string;
  /** The time/cost/risk impact of following the recommendation. */
  impact: string;
}

/**
 * A phased plan, emitted only when the interview states large-scale ambitions
 * that conflict with a tight budget/timeline — so the architect can name both
 * the pragmatic MVP and the growth path instead of silently picking one side.
 */
export interface PhasedArchitecture {
  /** What to build first, right-sized for the budget/timeline. */
  mvp: string;
  /** How the architecture evolves as scale materializes. */
  growthPath: string;
  /** What the migration from MVP to the growth architecture involves. */
  migrationNotes: string;
}

/** How one stated constraint is addressed by the design (R8). */
export interface ConstraintCompliance {
  /** The constraint, from an interview slot or a requirement. */
  constraint: string;
  howAddressed: string;
}

export interface SystemDesign {
  sessionId: string;
  generatedAt: string;
  /** How this design was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  architecture: ArchitectureType;
  architectureRationale: string;
  techStack: TechChoice[];
  services: ServiceModule[];
  /**
   * Build-vs-buy analysis over the standard capabilities the requirements imply
   * (R8). Optional/back-compat; generation always fills it for the applicable
   * capabilities.
   */
  buildVsBuy?: BuildVsBuyItem[];
  /**
   * Present only when scale ambitions conflict with the budget/timeline (R8);
   * absent otherwise.
   */
  phasedArchitecture?: PhasedArchitecture;
  /**
   * How each stated constraint is met (R8). Absent/empty when no constraints
   * exist.
   */
  constraintCompliance?: ConstraintCompliance[];
}
