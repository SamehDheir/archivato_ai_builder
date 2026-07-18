/**
 * The Project Roadmap — output of the Roadmap Planner stage. Produced from the
 * full generated pipeline (interview through API design), it sequences the work
 * into ordered phases, each with milestones and concrete tasks, plus rough
 * effort estimates and phase dependencies.
 *
 * Standalone artifact: it does NOT gate the design pipeline — it's an
 * implementation plan derived from it.
 */

import type { DerivedArtifact } from './freshness';
import type { GenerationProvenance } from './generation';
import { roundHalf, type EffortEstimate } from './effort';

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
  /**
   * The design module (service) names this phase builds (R10). The LLM proposes
   * the grouping; the week numbers below are computed in code from it. Optional —
   * absent on old rows / plan-mode runs, in which case no week range is shown.
   */
  moduleNames?: string[];
  /**
   * Effort-grounded person-week range (R10), **always computed by
   * `buildPhaseEffort` — never emitted by the LLM**. Present only when an effort
   * estimate was available; otherwise the phase renders without week numbers
   * (current behavior).
   */
  weeksMin?: number;
  weeksMax?: number;
  /** Phase 1 is always the MVP (R10). */
  isMvp?: boolean;
  /**
   * One sentence on what is usable / launchable at the end of this phase (R10) —
   * set on the MVP phase. Aligns with the R8 phased architecture's MVP when present.
   */
  mvpStatement?: string;
}

/**
 * A pair of roadmaps emitted only on a timeline conflict (R10): a reduced-scope
 * plan that fits the stated deadline, and the realistic full-scope plan. Needs
 * LLM judgment, so it's absent in the deterministic fallback (which produces a
 * single roadmap and lets the review flag the conflict instead).
 */
export interface AlternativeRoadmaps {
  /** Reduced scope to hit the deadline. */
  withinDeadline: RoadmapPhase[];
  /** The realistic full-scope plan (longer than the deadline). */
  fullScope: RoadmapPhase[];
  /** What the within-deadline plan drops, in client language. */
  excludedFromDeadline: string[];
}

export interface ProjectRoadmap extends DerivedArtifact {
  /** How this roadmap was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  sessionId: string;
  generatedAt: string;
  summary: string;
  /** Rough end-to-end duration, e.g. "~10 weeks". */
  totalEstimate: string;
  phases: RoadmapPhase[];
  /**
   * Present only when the stated timeline can't fit the full scope (R10). Absent
   * otherwise — the single `phases` roadmap is the plan.
   */
  alternativeRoadmaps?: AlternativeRoadmaps;
}

/**
 * Distribute an `EffortEstimate` across roadmap phases (R10). The LLM proposes
 * which design modules land in each phase (`moduleNames`); **this code computes
 * the week numbers** — the model never emits them. Each phase's range is the sum
 * of its modules' effort lines plus a proportional share of the fixed pool
 * (project setup, QA, DevOps, buffer, plus any flat/unassigned lines), allocated
 * by build weight with a per-phase baseline so an overhead-only phase (e.g.
 * Hardening) still gets a fair slice of QA/DevOps rather than zero.
 *
 * Pure. Returns new phase objects with `weeksMin`/`weeksMax` filled and every
 * other field untouched.
 */
export function buildPhaseEffort(
  phases: RoadmapPhase[],
  effort: EffortEstimate,
): RoadmapPhase[] {
  if (phases.length === 0) return phases;
  const lines = effort.lineItems ?? [];
  const norm = (s: string) => s.trim().toLowerCase();
  // Only lines that carry a design-module name can be assigned to a phase.
  const assignable = lines.filter((l) => !!l.module);

  const claimed = new Set<string>();
  const perPhase = phases.map((p) => {
    const names = new Set((p.moduleNames ?? []).map(norm));
    let min = 0;
    let max = 0;
    for (const l of assignable) {
      if (names.has(norm(l.module!))) {
        min += l.weeksMin;
        max += l.weeksMax;
        claimed.add(l.module!);
      }
    }
    return { min, max };
  });

  // The fixed pool = everything not claimed by a phase: fixed items, flat
  // integration lines, and any module a phase forgot to place (its weight is
  // redistributed rather than lost).
  let fixedMin = 0;
  let fixedMax = 0;
  for (const l of lines) {
    if (l.module && claimed.has(l.module)) continue;
    fixedMin += l.weeksMin;
    fixedMax += l.weeksMax;
  }

  const weights = perPhase.map((m) => m.max + 1);
  const totalWeight = weights.reduce((s, w) => s + w, 0) || phases.length;

  return phases.map((phase, i) => {
    const share = weights[i] / totalWeight;
    return {
      ...phase,
      weeksMin: roundHalf(perPhase[i].min + share * fixedMin),
      weeksMax: roundHalf(perPhase[i].max + share * fixedMax),
    };
  });
}

/** Format an effort range as a human week string, e.g. "~8–14 wks". */
export function formatWeekRange(min: number, max: number): string {
  const a = roundHalf(min);
  const b = roundHalf(max);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return a === b ? `~${fmt(a)} wks` : `~${fmt(a)}–${fmt(b)} wks`;
}
