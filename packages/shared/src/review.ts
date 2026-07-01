/**
 * The Review Report — output of the AI Architect Review stage. Produced by the
 * Reviewer agent from the full pipeline (interview through API design): a
 * holistic score with per-dimension sub-scores, categorized findings
 * (security, scalability, performance, cost) plus missing requirements and
 * suggestions.
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface ReviewFinding {
  title: string;
  detail: string;
  severity: Severity;
}

/** 0–100 health sub-scores, one per review dimension. */
export interface ReviewScores {
  security: number;
  scalability: number;
  performance: number;
  cost: number;
}

export interface ReviewReport {
  sessionId: string;
  generatedAt: string;
  /** Holistic 0–100 assessment across all dimensions. */
  overallScore: number;
  /** Per-dimension 0–100 sub-scores. */
  scores: ReviewScores;
  /**
   * Legacy alias of `scores.scalability`, kept so older clients/exports keep
   * working. Prefer `scores` / `overallScore`.
   */
  scalabilityScore: number;
  summary: string;
  securityIssues: ReviewFinding[];
  /** Scalability problems (horizontal scaling, async processing, boundaries). */
  scalabilityIssues: ReviewFinding[];
  performanceRisks: ReviewFinding[];
  /** Cost-optimization opportunities (caching, right-sizing, idle infra). */
  costOptimizations: ReviewFinding[];
  /** Missing requirements / features the design should cover. */
  missingFeatures: string[];
  /** High-level suggestions. */
  recommendations: string[];
}
