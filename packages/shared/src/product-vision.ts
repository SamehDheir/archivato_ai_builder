/**
 * The Product Vision — output of the Product Manager stage. Produced from the
 * confirmed interview (idea + intent + requirements summary), it frames the
 * product like a PM would: a north-star vision, strategic goals, an MVP cut vs.
 * a future roadmap, success metrics, and user personas.
 *
 * Standalone artifact: it does NOT gate the design pipeline — it sits alongside
 * it as a product-strategy view of the same session.
 */

import type { GenerationProvenance } from './generation';

/** A user persona: who they are, what they want, what frustrates them. */
export interface Persona {
  name: string;
  /** One-line description of the persona. */
  description: string;
  /** What this persona is trying to achieve. */
  goals: string[];
  /** Frustrations the product should remove. */
  painPoints: string[];
}

/** A measurable success metric with a target and why it matters. */
export interface SuccessMetric {
  name: string;
  /** The target to hit (e.g. "500 active clinics in 6 months"). */
  target: string;
  /** Why this metric reflects product success. */
  rationale: string;
}

export interface ProductVision {
  sessionId: string;
  generatedAt: string;
  /** How this vision was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  /** One-paragraph north-star statement. */
  vision: string;
  /** Strategic goals the product is driving toward. */
  goals: string[];
  /** The minimum scope to launch (must-haves). */
  mvp: string[];
  /** Post-MVP roadmap ideas. */
  futureFeatures: string[];
  successMetrics: SuccessMetric[];
  personas: Persona[];
}
