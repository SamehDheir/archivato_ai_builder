/**
 * The Test / QA Plan — output of the QA Planner stage. A structured testing plan
 * derived from the generated design: a strategy, test suites grouped by type
 * (unit / integration / e2e / security / performance / acceptance) with concrete
 * test cases, coverage goals, tooling, and out-of-scope notes.
 *
 * Standalone artifact (Pro): derived from the confirmed design but it does NOT
 * gate the pipeline and is not part of version snapshots. LLM-generated with a
 * deterministic fallback, so it always yields a complete, useful plan.
 */

import type { DerivedArtifact } from './freshness';

export type TestType =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'security'
  | 'performance'
  | 'acceptance';

/** Fixed display order + labels for the test-type set. */
export const TEST_TYPES: readonly { type: TestType; title: string }[] = [
  { type: 'unit', title: 'Unit' },
  { type: 'integration', title: 'Integration' },
  { type: 'e2e', title: 'End-to-End' },
  { type: 'security', title: 'Security' },
  { type: 'performance', title: 'Performance' },
  { type: 'acceptance', title: 'Acceptance' },
] as const;

export type TestPriority = 'high' | 'medium' | 'low';

export interface TestCase {
  /** Stable id, e.g. "TC-1". */
  id: string;
  title: string;
  /** The expected result / assertion. */
  expected: string;
  priority: TestPriority;
}

export interface TestSuite {
  /** Grouping name, e.g. "Auth" or "Billing endpoints". */
  name: string;
  type: TestType;
  /** What this suite verifies. */
  objective: string;
  cases: TestCase[];
}

export interface QaPlan extends DerivedArtifact {
  sessionId: string;
  generatedAt: string;
  /** One-paragraph overview of the testing approach. */
  summary: string;
  /** Overall strategy bullets (the pyramid, environments, CI gates…). */
  strategy: string[];
  suites: TestSuite[];
  /** Coverage targets, e.g. "≥80% unit coverage on services". */
  coverageGoals: string[];
  /** Recommended tools/frameworks (derived from the tech stack). */
  tooling: string[];
  /** Explicitly out-of-scope for this plan. */
  outOfScope: string[];
}
