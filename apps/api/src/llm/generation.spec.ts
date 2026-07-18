import {
  degradedReasonOf,
  isDegradedGeneration,
  preserveGeneration,
  type DatabaseDesign,
  type GenerationProvenance,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';
import { DatabaseDesignerAgent } from './agents/database-designer.agent';
import { MockLlmProvider } from './mock-llm.provider';
import { LlmHttpError } from './llm-http';
import { LlmJsonParseError, type LlmProvider } from './llm-provider.interface';

// ── the pure helpers ────────────────────────────────────────────────────────

const stamp = (over: Partial<GenerationProvenance> = {}): GenerationProvenance => ({
  mode: 'llm',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  ...over,
});

describe('isDegradedGeneration', () => {
  it('is false for a real model answer that was accepted', () => {
    expect(isDegradedGeneration(stamp())).toBe(false);
  });

  it('is true when the agent fell back', () => {
    expect(isDegradedGeneration(stamp({ mode: 'fallback' }))).toBe(true);
  });

  it('is true on the mock provider even when the agent took the llm path', () => {
    // MockLlmProvider returns parseable JSON, so a scripted response can pass
    // isValid and be stamped `llm` — but it is still not AI output, and
    // presenting it as one is exactly what this stamp exists to prevent.
    expect(isDegradedGeneration(stamp({ provider: 'mock', model: 'mock' }))).toBe(true);
  });

  it('is FALSE for an unstamped artifact — absent means unknown, not degraded', () => {
    // Rows written before provenance existed carry none. Warning on a guess
    // would nag every old project into re-running a billed Pro stage.
    expect(isDegradedGeneration(undefined)).toBe(false);
  });
});

describe('degradedReasonOf', () => {
  it('returns null when nothing is wrong', () => {
    expect(degradedReasonOf(stamp())).toBeNull();
    expect(degradedReasonOf(undefined)).toBeNull();
  });

  it('reports the recorded reason', () => {
    expect(degradedReasonOf(stamp({ mode: 'fallback', degradedReason: 'timeout' }))).toBe(
      'timeout',
    );
  });

  it('reports no_provider for mock, whichever branch it took', () => {
    expect(degradedReasonOf(stamp({ provider: 'mock' }))).toBe('no_provider');
  });

  it('falls back to call_failed when a fallback recorded no reason', () => {
    expect(degradedReasonOf(stamp({ mode: 'fallback' }))).toBe('call_failed');
  });
});

// ── the agent template ──────────────────────────────────────────────────────

const SYSTEM_DESIGN = {
  sessionId: 's1',
  generatedAt: 'now',
  architecture: 'modular_monolith',
  architectureRationale: 'r',
  techStack: [{ layer: 'database', technology: 'PostgreSQL', rationale: 'r' }],
  services: [{ name: 'Users', responsibility: 'r', dependencies: [] }],
} as SystemDesign;

const REQUIREMENTS = {
  sessionId: 's1',
  generatedAt: 'now',
  functional: [{ id: 'FR-1', title: 'Track orders', description: 'd', priority: 'must' }],
  nonFunctional: [],
  roles: [{ name: 'Customer', description: 'd', permissions: [] }],
  businessRules: [],
  constraints: [],
  assumptions: [],
} as RequirementDocument;

const CTX = {
  idea: 'an online store',
  intent: null,
  requirements: REQUIREMENTS,
  systemDesign: SYSTEM_DESIGN,
};

const VALID_DESIGN = {
  databaseType: 'PostgreSQL',
  entities: [{ name: 'orders', description: 'd', columns: [{ name: 'id', type: 'uuid', nullable: false }] }],
  relations: [],
};

/** A provider whose every call throws — to drive the failure branches. */
function throwingProvider(err: Error): LlmProvider {
  return {
    name: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    complete: async () => {
      throw err;
    },
    completeJson: async () => {
      throw err;
    },
  };
}

async function generateWith(provider: LlmProvider): Promise<DatabaseDesign> {
  return new DatabaseDesignerAgent(provider).generate('s1', CTX);
}

describe('generateArtifact stamps provenance', () => {
  it('records the llm path when the model answer is accepted', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson(VALID_DESIGN);

    const design = await generateWith(mock);

    expect(design.generation).toEqual({ mode: 'llm', provider: 'mock', model: 'mock' });
    // The artifact itself is untouched by stamping.
    expect(design.entities[0].name).toBe('orders');
  });

  it('records invalid_output when the model answers with unusable JSON', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson({ entities: [] });

    const design = await generateWith(mock);

    expect(design.generation?.mode).toBe('fallback');
    expect(design.generation?.degradedReason).toBe('invalid_output');
  });

  it('records parse_error when the model answers with prose', async () => {
    // The expensive failure: the call SUCCEEDED and was billed, only the JSON
    // was unusable — so it points at the prompt or model, not the network.
    const design = await generateWith(
      throwingProvider(new LlmJsonParseError('not json', 'sorry!')),
    );

    expect(design.generation?.degradedReason).toBe('parse_error');
  });

  it('records timeout separately from a generic call failure', async () => {
    // Keyed on `kind`, not on the message text: the message is prose built in
    // llm-http.ts, and rewording it must not silently reclassify every timeout.
    const timedOut = await generateWith(
      throwingProvider(new LlmHttpError('anything at all', null, true, 'timeout')),
    );
    expect(timedOut.generation?.degradedReason).toBe('timeout');

    const failed = await generateWith(
      throwingProvider(
        new LlmHttpError('Groq request failed with status 503', 503, true, 'http'),
      ),
    );
    expect(failed.generation?.degradedReason).toBe('call_failed');

    const offline = await generateWith(
      throwingProvider(new LlmHttpError('network error', null, true, 'network')),
    );
    expect(offline.generation?.degradedReason).toBe('call_failed');
  });

  it('carries the real provider and model, not the mock defaults', async () => {
    const design = await generateWith(throwingProvider(new Error('down')));

    expect(design.generation).toEqual({
      mode: 'fallback',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      degradedReason: 'call_failed',
    });
  });

  it('still produces a complete artifact on the fallback path', async () => {
    const design = await generateWith(throwingProvider(new Error('down')));

    // Provenance is additive — the resilience guarantee is unchanged.
    expect(design.entities.length).toBeGreaterThan(0);
    expect(design.sessionId).toBe('s1');
    expect(isDegradedGeneration(design.generation)).toBe(true);
  });
});

describe('preserveGeneration — a human edit keeps the stamp', () => {
  /** Stands in for an artifact body the structured editor sends back. */
  type Edited = { entities: string[]; generation?: GenerationProvenance };
  const edited = (over: Partial<Edited> = {}): Edited => ({
    entities: ['edited'],
    ...over,
  });

  it('carries the stored provenance onto an edited artifact', () => {
    const existing = { generation: stamp({ mode: 'fallback', degradedReason: 'timeout' }) };

    // Editing one sentence of a document the model never wrote does not make it
    // AI-written, so the warning has to survive the edit.
    expect(preserveGeneration(edited(), existing).generation).toEqual(existing.generation);
  });

  it('ignores whatever the client sent and uses the stored stamp', () => {
    const existing = { generation: stamp({ mode: 'fallback' }) };
    const forged = edited({ generation: stamp({ mode: 'llm', provider: 'claude' }) });

    expect(preserveGeneration(forged, existing).generation?.mode).toBe('fallback');
  });

  it('leaves an unstamped artifact unstamped rather than inventing one', () => {
    expect(preserveGeneration(edited(), { generation: undefined })).not.toHaveProperty(
      'generation',
    );
    expect(preserveGeneration(edited(), null)).not.toHaveProperty('generation');
    // …and it strips a forged stamp when the server has none to restore.
    expect(
      preserveGeneration(edited({ generation: stamp() }), null),
    ).not.toHaveProperty('generation');
  });
});

describe('the mock provider reads as degraded end to end', () => {
  it('flags a scripted mock success as degraded despite the llm mode', async () => {
    const mock = new MockLlmProvider();
    mock.enqueueJson(VALID_DESIGN);

    const design = await generateWith(mock);

    expect(design.generation?.mode).toBe('llm');
    expect(isDegradedGeneration(design.generation)).toBe(true);
    expect(degradedReasonOf(design.generation)).toBe('no_provider');
  });

  it('flags the default (unscripted) mock responder as degraded too', async () => {
    // The default responder echoes the prompt, which fails isValid — so this
    // takes the fallback branch. Either way the user must not see "AI output".
    const design = await generateWith(new MockLlmProvider());

    expect(isDegradedGeneration(design.generation)).toBe(true);
  });
});
