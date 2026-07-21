/**
 * The Product Vision — output of the Product Manager stage. Produced from the
 * confirmed interview (idea + intent + requirements summary), it frames the
 * product like a PM would: a north-star vision, strategic goals, an MVP cut vs.
 * a future roadmap, success metrics, and user personas.
 *
 * Standalone artifact: it does NOT gate the design pipeline — it sits alongside
 * it as a product-strategy view of the same session.
 */

import type { LocalizedArtifact } from './artifact-language';
import type { GenerationProvenance } from './generation';
import { stripUrls } from './prompt-safety';

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

export interface ProductVision extends LocalizedArtifact {
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

/**
 * Strip links from the product vision, and report what was removed.
 *
 * The vision is generated from the same untrusted interview text as the
 * requirement document, and it is **the section the share page leads with** — the
 * first thing a client reads. It is a strategy narrative (a north-star sentence,
 * goals, personas), so like the requirement document it has no legitimate URL,
 * and an injected link would sit at the very top of the page the owner sent.
 *
 * Mirrors `screenRequirementDocument`; see `prompt-safety.ts` for why the rule is
 * an allowlist rather than "was it in the input".
 */
export function screenProductVision(vision: ProductVision): {
  vision: ProductVision;
  removed: string[];
} {
  const removed: string[] = [];
  const clean = (text: string): string => {
    const result = stripUrls(text);
    removed.push(...result.removed);
    return result.text;
  };

  // `?? []` throughout, for the reason given in `screenRequirementDocument`: this
  // may run over a stored row that predates a field.
  const text = (value: string | undefined): string => clean(value ?? '');

  return {
    vision: {
      ...vision,
      vision: text(vision.vision),
      goals: (vision.goals ?? []).map(text),
      mvp: (vision.mvp ?? []).map(text),
      futureFeatures: (vision.futureFeatures ?? []).map(text),
      successMetrics: (vision.successMetrics ?? []).map((m) => ({
        ...m,
        name: text(m.name),
        target: text(m.target),
        rationale: text(m.rationale),
      })),
      personas: (vision.personas ?? []).map((p) => ({
        ...p,
        name: text(p.name),
        description: text(p.description),
        goals: (p.goals ?? []).map(text),
        painPoints: (p.painPoints ?? []).map(text),
      })),
    },
    removed,
  };
}
