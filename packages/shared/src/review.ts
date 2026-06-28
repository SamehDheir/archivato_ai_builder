/**
 * The Review Report — output of the AI Review Engine stage (spec Step 9).
 * Produced by the Reviewer agent from the full pipeline (interview through API
 * design): a scalability score plus categorized findings and recommendations.
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface ReviewFinding {
  title: string;
  detail: string;
  severity: Severity;
}

export interface ReviewReport {
  sessionId: string;
  generatedAt: string;
  /** 0–100 overall scalability assessment. */
  scalabilityScore: number;
  summary: string;
  securityIssues: ReviewFinding[];
  performanceRisks: ReviewFinding[];
  missingFeatures: string[];
  recommendations: string[];
}
