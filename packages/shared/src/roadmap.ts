/**
 * The Project Roadmap — output of the Roadmap Planner stage. Produced from the
 * full generated pipeline (interview through API design), it sequences the work
 * into ordered phases, each with milestones and concrete tasks, plus rough
 * effort estimates and phase dependencies.
 *
 * Standalone artifact: it does NOT gate the design pipeline — it's an
 * implementation plan derived from it.
 */

export interface RoadmapTask {
  title: string;
  /** Optional extra context for the task. */
  detail?: string;
}

export interface RoadmapMilestone {
  title: string;
  /** Rough effort estimate, e.g. "1 wk" or "3 days". */
  effort: string;
  tasks: RoadmapTask[];
}

export interface RoadmapPhase {
  /** Short phase name, e.g. "Foundation". */
  name: string;
  /** What this phase delivers. */
  goal: string;
  /** Aggregate rough estimate for the phase, e.g. "~2 wks". */
  effort: string;
  /** Names of phases that must complete first (sequencing). */
  dependsOn: string[];
  milestones: RoadmapMilestone[];
}

export interface ProjectRoadmap {
  sessionId: string;
  generatedAt: string;
  summary: string;
  /** Rough end-to-end duration, e.g. "~10 weeks". */
  totalEstimate: string;
  phases: RoadmapPhase[];
}
