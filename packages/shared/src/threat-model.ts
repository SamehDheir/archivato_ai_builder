/**
 * The Security Threat Model — output of the Threat Modeler stage. A **STRIDE**
 * analysis of the generated design: for each category (Spoofing, Tampering,
 * Repudiation, Information Disclosure, Denial of Service, Elevation of
 * Privilege) it enumerates concrete threats against the system's components /
 * entry points, with a severity and a recommended mitigation.
 *
 * Standalone artifact (Pro): derived from the confirmed design but it does NOT
 * gate the pipeline and is not part of version snapshots. LLM-generated with a
 * deterministic fallback, so it always yields a complete, useful model.
 */

import type { LocalizedArtifact } from './artifact-language';
import type { Severity } from './review';
import type { DerivedArtifact } from './freshness';
import type { GenerationProvenance } from './generation';

export type StrideCategory =
  | 'spoofing'
  | 'tampering'
  | 'repudiation'
  | 'information_disclosure'
  | 'denial_of_service'
  | 'elevation_of_privilege';

/** Fixed display order + the security property each STRIDE category protects. */
export const STRIDE_CATEGORIES: readonly {
  category: StrideCategory;
  title: string;
  /** The security property this category threatens. */
  property: string;
}[] = [
  { category: 'spoofing', title: 'Spoofing', property: 'Authentication' },
  { category: 'tampering', title: 'Tampering', property: 'Integrity' },
  { category: 'repudiation', title: 'Repudiation', property: 'Non-repudiation' },
  {
    category: 'information_disclosure',
    title: 'Information Disclosure',
    property: 'Confidentiality',
  },
  {
    category: 'denial_of_service',
    title: 'Denial of Service',
    property: 'Availability',
  },
  {
    category: 'elevation_of_privilege',
    title: 'Elevation of Privilege',
    property: 'Authorization',
  },
] as const;

export interface Threat {
  category: StrideCategory;
  /** The asset / component / entry point at risk, e.g. "Auth endpoints". */
  component: string;
  /** The threat scenario. */
  threat: string;
  severity: Severity;
  /** Recommended mitigation / control. */
  mitigation: string;
}

export interface ThreatModel extends DerivedArtifact, LocalizedArtifact {
  /** How this model was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  sessionId: string;
  generatedAt: string;
  /** One-paragraph overview of the security posture. */
  summary: string;
  /** Trust boundaries / entry points identified in the design. */
  trustBoundaries: string[];
  /** Assumptions the model rests on (scope, environment). */
  assumptions: string[];
  threats: Threat[];
}

/**
 * Coerce a threat model to a complete shape — the `normalizeDatabaseDesign`
 * rule, applied at both boundaries (agent on write, both stores on read).
 *
 * It matters more here than on an owner-only artifact: the threat model is in
 * the share payload, so a model reply that omitted `trustBoundaries` would take
 * down the **public page a client is reading**, with no owner present to see it.
 * The agent's `isValid` only ever gated on `threats`.
 */
export function normalizeThreatModel(model: ThreatModel): ThreatModel {
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

  return {
    ...model,
    summary: typeof model?.summary === 'string' ? model.summary : '',
    trustBoundaries: strings(model?.trustBoundaries),
    assumptions: strings(model?.assumptions),
    threats: Array.isArray(model?.threats)
      ? model.threats.filter(
          (t): t is Threat => !!t && typeof t.threat === 'string',
        )
      : [],
  };
}
