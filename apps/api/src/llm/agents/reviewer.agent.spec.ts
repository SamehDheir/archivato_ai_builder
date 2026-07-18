import type {
  ApiDesign,
  DatabaseDesign,
  RequirementDocument,
  SystemDesign,
} from '@archivato/shared';
import { ReviewerAgent, type ReviewContext } from './reviewer.agent';
import type { LlmProvider } from '../llm-provider.interface';

/** An LLM provider that returns one canned JSON payload. */
function stubLlm(payload: unknown): LlmProvider {
  return {
    complete: async () => JSON.stringify(payload),
    completeJson: async () => payload as never,
  } as unknown as LlmProvider;
}

const requirements: RequirementDocument = {
  sessionId: 's1',
  generatedAt: '2026-07-18T08:11:53.973Z',
  functional: [
    {
      id: 'FR-1',
      title: 'Billing and Payments',
      description: 'Accountants can generate invoices and process payments.',
      priority: 'must',
    },
  ],
  nonFunctional: [],
  roles: [],
  businessRules: [],
  constraints: [],
  assumptions: [],
  outOfScope: [
    { item: 'Telemedicine / live video consultations' },
    { item: 'Native patient and clinician mobile apps' },
  ],
};

const ctx: ReviewContext = {
  idea: 'A clinic management platform',
  intent: null,
  requirements,
  systemDesign: {
    sessionId: 's1',
    generatedAt: 'now',
    architecture: 'modular_monolith',
    architectureRationale: 'x',
    services: [{ name: 'PatientService', responsibility: 'x', dependencies: [] }],
    techStack: [],
  } as unknown as SystemDesign,
  databaseDesign: {
    sessionId: 's1',
    generatedAt: 'now',
    databaseType: 'PostgreSQL',
    entities: [],
    relations: [],
  } as DatabaseDesign,
  apiDesign: { sessionId: 's1', generatedAt: 'now', modules: [] } as ApiDesign,
};

describe('ReviewerAgent normalization', () => {
  it('computes overallScore from the four engineering dimensions', async () => {
    // The model reported 70 against 80/60/70/50, whose average is 65. The
    // headline number a client reads has to be arithmetic, not a claim.
    const agent = new ReviewerAgent(
      stubLlm({
        sessionId: 's1',
        generatedAt: 'now',
        overallScore: 70,
        scores: {
          security: 80,
          scalability: 60,
          performance: 70,
          cost: 50,
          clientReadiness: 40,
        },
        summary: 'x',
        securityIssues: [],
        scalabilityIssues: [],
        performanceRisks: [],
        costOptimizations: [],
        missingFeatures: [],
        recommendations: [],
      }),
    );
    const report = await agent.generate('s1', ctx);
    expect(report.overallScore).toBe(65);
  });

  it('does not let the deal-risk axis move the overall score', async () => {
    const agent = new ReviewerAgent(
      stubLlm({
        sessionId: 's1',
        generatedAt: 'now',
        overallScore: 45,
        scores: {
          security: 80,
          scalability: 80,
          performance: 80,
          cost: 80,
          clientReadiness: 10,
        },
        summary: 'x',
        securityIssues: [],
        scalabilityIssues: [],
        performanceRisks: [],
        costOptimizations: [],
        missingFeatures: [],
        recommendations: [],
      }),
    );
    expect((await agent.generate('s1', ctx)).overallScore).toBe(80);
  });

  it('drops "missing" features the document deliberately excluded', async () => {
    const agent = new ReviewerAgent(
      stubLlm({
        sessionId: 's1',
        generatedAt: 'now',
        overallScore: 70,
        scores: { security: 70, scalability: 70, performance: 70, cost: 70 },
        summary: 'x',
        securityIssues: [],
        scalabilityIssues: [],
        performanceRisks: [],
        costOptimizations: [],
        missingFeatures: [
          'Telemedicine functionality',
          'Native patient and clinician mobile apps',
          'Automated appointment reminders',
        ],
        recommendations: [],
      }),
    );
    const report = await agent.generate('s1', ctx);
    // The two that are out of scope go; the genuine gap stays.
    expect(report.missingFeatures).toEqual(['Automated appointment reminders']);
  });

  it('keeps every missing feature when nothing is out of scope', async () => {
    const agent = new ReviewerAgent(
      stubLlm({
        sessionId: 's1',
        generatedAt: 'now',
        overallScore: 70,
        scores: { security: 70, scalability: 70, performance: 70, cost: 70 },
        summary: 'x',
        securityIssues: [],
        scalabilityIssues: [],
        performanceRisks: [],
        costOptimizations: [],
        missingFeatures: ['Telemedicine functionality'],
        recommendations: [],
      }),
    );
    const report = await agent.generate('s1', {
      ...ctx,
      requirements: { ...requirements, outOfScope: undefined },
    });
    expect(report.missingFeatures).toEqual(['Telemedicine functionality']);
  });
});
