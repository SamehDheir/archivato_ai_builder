import type { IntentAnalysis, RequirementDocument } from '@archivato/shared';
import { RefinementAgent } from './refinement.agent';
import type { RefinementContext } from './refinement.agent';
import { MockLlmProvider } from '../mock-llm.provider';

const INTENT: IntentAnalysis = {
  summary: 'Home-services booking marketplace.',
  domain: 'delivery/logistics',
  primaryUsers: ['Customer', 'Driver'],
  coreCapabilities: ['booking'],
  openQuestions: [],
};

function current(): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-15T00:00:00.000Z',
    executiveSummary: 'A dependable on-demand delivery service for a single city.',
    functional: [
      { id: 'FR-1', title: 'Place order', description: 'Customers can place an order.', priority: 'must' },
    ],
    nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'TLS everywhere.' }],
    roles: [{ name: 'Customer', description: 'Places orders.', permissions: ['order:create'] }],
    businessRules: [{ id: 'BR-1', description: 'One active order per customer.' }],
    constraints: ['Web-first at launch.'],
    assumptions: ['Drivers are contractors.'],
    outOfScope: [
      { item: 'Live GPS tracking of drivers', reason: 'Not needed for scheduled runs.' },
      { item: 'Native mobile apps (iOS / Android)', reason: 'Web-first at launch.' },
    ],
    assumptionsAndOpenQuestions: [
      { assumption: 'Drivers are contractors.', impactIfWrong: 'Payout model changes.' },
    ],
    openQuestions: [],
  };
}

function ctx(overrides: Partial<RefinementContext> = {}): RefinementContext {
  return {
    instruction: 'Add a customer loyalty program',
    current: current(),
    idea: 'A delivery marketplace',
    intent: INTENT,
    ...overrides,
  };
}

describe('RefinementAgent narrative reconciliation (R7)', () => {
  it('does not let an empty model outOfScope wipe the carried-over section', async () => {
    const mock = new MockLlmProvider();
    // A valid doc (functional/nonFunctional/roles present) that helpfully but
    // wrongly returns an EMPTY outOfScope — must fall back to the current doc.
    mock.enqueueJson({
      document: {
        functional: [
          { id: 'FR-1', title: 'Place order', description: 'Customers can place an order.', priority: 'must' },
          { id: 'FR-2', title: 'Loyalty', description: 'Customers earn loyalty points.', priority: 'should' },
        ],
        nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'TLS everywhere.' }],
        roles: [{ name: 'Customer', description: 'Places orders.', permissions: ['order:create'] }],
        businessRules: [{ id: 'BR-1', description: 'One active order per customer.' }],
        constraints: ['Web-first at launch.'],
        assumptions: ['Drivers are contractors.'],
        outOfScope: [],
      },
      summary: 'Added a loyalty program.',
    });
    const agent = new RefinementAgent(mock);

    const { document } = await agent.refine('s1', ctx());

    expect(document.outOfScope).toEqual(current().outOfScope);
    expect(document.executiveSummary).toBe(current().executiveSummary);
    expect(document.assumptionsAndOpenQuestions).toEqual(
      current().assumptionsAndOpenQuestions,
    );
  });

  it('prunes an out-of-scope item the refine just brought into scope', async () => {
    // No enqueued JSON → the model output is malformed → deterministic amend,
    // which appends a functional requirement built from the instruction.
    const agent = new RefinementAgent(new MockLlmProvider());

    const { document } = await agent.refine(
      's1',
      ctx({ instruction: 'Add live GPS tracking of drivers on a map' }),
    );

    const items = (document.outOfScope ?? []).map((o) => o.item);
    expect(items).not.toContain('Live GPS tracking of drivers');
    // An unrelated exclusion is kept.
    expect(items).toContain('Native mobile apps (iOS / Android)');
  });

  it('keeps unrelated out-of-scope items on an unrelated refine', async () => {
    const agent = new RefinementAgent(new MockLlmProvider());

    const { document } = await agent.refine(
      's1',
      ctx({ instruction: 'Add an admin CSV export' }),
    );

    expect((document.outOfScope ?? []).map((o) => o.item)).toEqual(
      current().outOfScope!.map((o) => o.item),
    );
  });
});

describe('provenance across a refine', () => {
  /** A refine rewrites the content, so it must re-stamp rather than inherit. */
  const stale = {
    mode: 'llm' as const,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
  };

  it('replaces an inherited stamp when the model answers', async () => {
    const llm = new MockLlmProvider();
    llm.enqueueJson({
      document: {
        functional: [
          { id: 'FR-1', title: 'Place order', description: 'd', priority: 'must' },
          { id: 'FR-2', title: 'Loyalty', description: 'd', priority: 'should' },
        ],
        nonFunctional: [],
        roles: [{ name: 'Customer', description: 'd', permissions: [] }],
      },
      summary: 'Added loyalty.',
    });

    const out = await new RefinementAgent(llm).refine(
      's1',
      ctx({ current: { ...current(), generation: stale } }),
    );

    // Spreading `ctx.current` would have carried the old groq stamp through.
    expect(out.document.generation).toEqual({
      mode: 'llm',
      provider: 'mock',
      model: 'mock',
    });
  });

  it('stamps a fallback when the refine fails, not the inherited success', async () => {
    const failing = {
      name: 'groq',
      defaultModel: 'llama-3.3-70b-versatile',
      complete: async () => {
        throw new Error('down');
      },
      completeJson: async () => {
        throw new Error('down');
      },
    };

    const out = await new RefinementAgent(failing).refine(
      's1',
      ctx({ current: { ...current(), generation: stale } }),
    );

    // The doc was AI-written before and is template-amended now — saying "llm"
    // here is exactly the lie the stamp exists to prevent.
    expect(out.document.generation?.mode).toBe('fallback');
    expect(out.document.generation?.degradedReason).toBe('call_failed');
  });
});
