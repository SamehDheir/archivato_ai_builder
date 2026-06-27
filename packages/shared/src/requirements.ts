/**
 * The formal Requirement Document — the output of the Requirement Engineer
 * stage, produced from a confirmed interview. Structured JSON (spec Step 3).
 */

export type RequirementPriority = 'must' | 'should' | 'could';

export interface FunctionalRequirement {
  /** Stable id, e.g. "FR-1". */
  id: string;
  title: string;
  description: string;
  priority: RequirementPriority;
}

export interface NonFunctionalRequirement {
  /** Stable id, e.g. "NFR-1". */
  id: string;
  /** performance | security | scalability | availability | usability | … */
  category: string;
  description: string;
}

export interface UserRole {
  name: string;
  description: string;
  permissions: string[];
}

export interface BusinessRule {
  /** Stable id, e.g. "BR-1". */
  id: string;
  description: string;
}

export interface RequirementDocument {
  sessionId: string;
  /** ISO timestamp. */
  generatedAt: string;
  functional: FunctionalRequirement[];
  nonFunctional: NonFunctionalRequirement[];
  roles: UserRole[];
  businessRules: BusinessRule[];
  constraints: string[];
  assumptions: string[];
}
