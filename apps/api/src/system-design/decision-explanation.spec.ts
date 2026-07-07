import {
  buildDecisionExplanation,
  type SystemDesign,
} from '@archivato/shared';

const design: SystemDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  architecture: 'modular_monolith',
  architectureRationale: 'Clear seams without distributed overhead.',
  techStack: [
    { layer: 'backend', technology: 'NestJS', rationale: '' },
    { layer: 'database', technology: 'PostgreSQL', rationale: 'ACID + JSONB.' },
    { layer: 'exotic', technology: 'SomeNewDB', rationale: '' },
  ],
  services: [
    { name: 'Auth', responsibility: 'Handles authentication.', dependencies: [] },
    { name: 'Billing', responsibility: 'Manages invoices.', dependencies: ['Auth'] },
  ],
};

describe('buildDecisionExplanation (deterministic fallback)', () => {
  it('explains the architecture with real tradeoffs + alternatives', () => {
    const e = buildDecisionExplanation(design, { kind: 'architecture', key: '' });
    expect(e.kind).toBe('architecture');
    expect(e.subject).toBe('modular_monolith');
    // Prefers the design's own rationale when present.
    expect(e.rationale).toContain('Clear seams');
    expect(e.tradeoffs.length).toBeGreaterThan(0);
    expect(e.alternatives.map((a) => a.name)).toContain('Microservices');
    expect(e.risks.length).toBeGreaterThan(0);
  });

  it('explains a known tech pick from the knowledge base', () => {
    const e = buildDecisionExplanation(design, { kind: 'tech', key: 'database' });
    expect(e.subject).toBe('PostgreSQL');
    // Prefers the design's own rationale, falling back to the KB otherwise.
    expect(e.rationale).toContain('ACID');
    expect(e.title).toContain('PostgreSQL');
    expect(e.alternatives.length).toBeGreaterThan(0);
  });

  it('still returns a complete shape for an unknown tech', () => {
    const e = buildDecisionExplanation(design, { kind: 'tech', key: 'exotic' });
    expect(e.subject).toBe('SomeNewDB');
    expect(e.rationale.length).toBeGreaterThan(0);
    expect(e.tradeoffs.length).toBeGreaterThan(0);
    expect(e.alternatives.length).toBeGreaterThan(0);
    expect(e.risks.length).toBeGreaterThan(0);
  });

  it('explains a service and flags its dependents', () => {
    const e = buildDecisionExplanation(design, { kind: 'service', key: 'Auth' });
    expect(e.subject).toBe('Auth');
    expect(e.rationale).toContain('authentication');
    // Billing depends on Auth → risk should mention the dependent.
    expect(e.risks.join(' ')).toContain('Billing');
  });

  it('tolerates a missing subject without throwing', () => {
    const e = buildDecisionExplanation(design, { kind: 'service', key: 'Ghost' });
    expect(e.subject).toBe('Ghost');
    expect(e.rationale.length).toBeGreaterThan(0);
  });
});
