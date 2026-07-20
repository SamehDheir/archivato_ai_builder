import type {
  DatabaseDesign,
  RequirementDocument,
  SystemDesign,
} from '@archivato/shared';
import { DatabaseDesignerAgent } from './database-designer.agent';
import { MockLlmProvider } from '../mock-llm.provider';
import type { LlmMessage } from '../llm-provider.interface';

/**
 * Schema chunking — the tier-safe answer to large-project generation.
 *
 * A big schema does not fit one call, and raising `maxTokens` is the documented
 * anti-pattern: providers reserve the budget against tokens-per-minute, so a
 * larger number is refused *before the model runs* on a free tier (a 413). So a
 * large schema is enumerated, designed in batches, and merged in code — the same
 * shape the API designer uses, and it works on every tier because it never
 * raises the per-call reservation.
 *
 * These tests drive a prompt-aware mock: the enumerate call returns the table
 * list, each chunk call returns its own tables' definitions, and the agent
 * merges them. The single-call path (small schemas) must stay untouched.
 */

const roles = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Role${i + 1}`,
    description: '',
    permissions: [],
  }));

function requirements(roleCount: number): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    functional: [
      { id: 'FR-1', title: 'Do the thing', description: 'Users do the thing.', priority: 'must' },
    ],
    nonFunctional: [],
    roles: roles(roleCount),
    businessRules: [],
    constraints: [],
    assumptions: [],
  };
}

function systemDesign(serviceCount: number): SystemDesign {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    architecture: 'modular_monolith',
    architectureRationale: 'Simple.',
    techStack: [{ layer: 'database', technology: 'PostgreSQL', rationale: 'Relational.' }],
    services: Array.from({ length: serviceCount }, (_, i) => ({
      name: `Service${i + 1}`,
      responsibility: 'x',
      dependencies: [],
    })),
  };
}

const lastUser = (messages: LlmMessage[]): string =>
  [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

const entity = (name: string) => ({
  name,
  description: `${name} table`,
  columns: [
    { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
    { name: 'label', type: 'string', nullable: false },
  ],
});

/**
 * Batch table names are the `- name — purpose` (or bare `- name`) lines in a
 * chunk prompt. The lookahead for an em-dash-or-end-of-line is what keeps the
 * JSON-spec bullets (`- entities[]: {…}`) out of the parse.
 */
function batchNames(prompt: string): string[] {
  return prompt
    .split('\n')
    .map((line) => /^-\s+([a-z0-9_]+)(?=\s+—|\s*$)/i.exec(line)?.[1])
    .filter((n): n is string => !!n);
}

describe('schema chunking', () => {
  it('enumerates, designs in batches, and merges a large schema', async () => {
    const tables = Array.from({ length: 13 }, (_, i) => `t${String(i + 1).padStart(2, '0')}`);
    let enumerateCalls = 0;

    const mock = new MockLlmProvider((messages) => {
      const prompt = lastUser(messages);
      if (prompt.includes('Table NAMES and purposes only')) {
        enumerateCalls += 1;
        return JSON.stringify({
          entities: tables.map((name) => ({ name, purpose: `holds ${name}` })),
        });
      }
      if (prompt.includes('This is part')) {
        const batch = batchNames(prompt);
        const relations = [
          // A relation FROM this batch's first table (kept). Chunk 1 points at a
          // table owned by chunk 2, referenced by name across the chunk boundary.
          { from: batch[0], to: 't07', type: 'one-to-many' as const },
          // A relation whose `from` is NOT in this batch — it speaks for another
          // chunk's table and MUST be dropped, or the same edge lands twice.
          { from: 't99', to: batch[0], type: 'one-to-one' as const },
        ];
        return JSON.stringify({ entities: batch.map(entity), relations });
      }
      return '{}';
    });

    // 6 services + 4 roles = 10 > SINGLE_CALL_ENTITY_BUDGET → chunk.
    const design: DatabaseDesign = await new DatabaseDesignerAgent(mock).generate('s1', {
      idea: 'A large multi-domain platform',
      intent: null,
      requirements: requirements(4),
      systemDesign: systemDesign(6),
    });

    // One enumerate call, then every enumerated table survives the merge.
    expect(enumerateCalls).toBe(1);
    expect(design.entities.map((e) => e.name).sort()).toEqual([...tables].sort());

    // Every kept relation originates from the chunk that owns its source table;
    // the cross-chunk edge (t01 → t07) is present exactly once.
    const edge = (r: { from: string; to: string }) => `${r.from}->${r.to}`;
    const edges = design.relations.map(edge);
    expect(edges).toContain('t01->t07');
    expect(edges.filter((e) => e === 't01->t07')).toHaveLength(1);
    // The out-of-batch relation was dropped on every chunk.
    expect(edges.some((e) => e.startsWith('t99->'))).toBe(false);

    // Model-authored, so it is stamped as an LLM generation, not a fallback.
    expect(design.generation?.mode).toBe('llm');
  });

  it('leaves a small schema on the single-call path (never enumerates)', async () => {
    let enumerateCalls = 0;
    let designCalls = 0;

    const mock = new MockLlmProvider((messages) => {
      const prompt = lastUser(messages);
      if (prompt.includes('Table NAMES and purposes only')) {
        enumerateCalls += 1;
        return '{}';
      }
      designCalls += 1;
      return JSON.stringify({
        databaseType: 'PostgreSQL',
        entities: [entity('users'), entity('orders')],
        relations: [{ from: 'users', to: 'orders', type: 'one-to-many' }],
      });
    });

    // 2 services + 1 role = 3 ≤ budget → single call.
    const design = await new DatabaseDesignerAgent(mock).generate('s1', {
      idea: 'A tiny store',
      intent: null,
      requirements: requirements(1),
      systemDesign: systemDesign(2),
    });

    expect(enumerateCalls).toBe(0);
    expect(designCalls).toBe(1);
    expect(design.entities.map((e) => e.name)).toContain('orders');
    expect(design.generation?.mode).toBe('llm');
  });

  it('falls through to the deterministic build when every chunk fails', async () => {
    const tables = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
    const mock = new MockLlmProvider((messages) => {
      const prompt = lastUser(messages);
      if (prompt.includes('Table NAMES and purposes only')) {
        return JSON.stringify({ entities: tables.map((name) => ({ name, purpose: '' })) });
      }
      // Every design chunk returns junk → no tables survive → null → the caller
      // takes the single pass (also junk here) → deterministic fallback.
      return '{}';
    });

    const design = await new DatabaseDesignerAgent(mock).generate('s1', {
      idea: 'A large platform',
      intent: null,
      requirements: requirements(4),
      systemDesign: systemDesign(6),
    });

    // The users table is the deterministic build's anchor; a real design results.
    expect(design.entities.length).toBeGreaterThan(0);
    expect(design.entities.map((e) => e.name)).toContain('users');
    expect(design.generation?.mode).toBe('fallback');
  });
});
