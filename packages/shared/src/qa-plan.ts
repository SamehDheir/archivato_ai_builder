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
import type { GenerationProvenance } from './generation';

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
  /** How this plan was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
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

/**
 * Coerce a QA plan to a complete shape — the `normalizeDatabaseDesign` rule,
 * applied at both boundaries (agent on write, both stores on read).
 *
 * Like the threat model this renders on the **public share page**, and it has
 * the widest exposure of any artifact here: five required arrays, of which the
 * agent's `isValid` checked exactly one (`suites`).
 */
export function normalizeQaPlan(plan: QaPlan): QaPlan {
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

  return {
    ...plan,
    summary: typeof plan?.summary === 'string' ? plan.summary : '',
    strategy: strings(plan?.strategy),
    coverageGoals: strings(plan?.coverageGoals),
    tooling: strings(plan?.tooling),
    outOfScope: strings(plan?.outOfScope),
    suites: Array.isArray(plan?.suites)
      ? plan.suites
          .filter((s): s is TestSuite => !!s && typeof s.name === 'string')
          .map((s) => ({
            ...s,
            objective: typeof s.objective === 'string' ? s.objective : '',
            cases: Array.isArray(s.cases)
              ? s.cases.filter((c): c is TestCase => !!c && typeof c.title === 'string')
              : [],
          }))
      : [],
  };
}
