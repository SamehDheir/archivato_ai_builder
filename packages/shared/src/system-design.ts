/**
 * The System Design — output of the System Architect stage (spec Step 4).
 * Produced from a confirmed interview + its Requirement Document.
 */

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

export interface ServiceModule {
  /** e.g. Auth, Users, Billing, Notifications. */
  name: string;
  responsibility: string;
  /** Names of other services this one depends on. */
  dependencies: string[];
}

export interface SystemDesign {
  sessionId: string;
  generatedAt: string;
  architecture: ArchitectureType;
  architectureRationale: string;
  techStack: TechChoice[];
  services: ServiceModule[];
}
