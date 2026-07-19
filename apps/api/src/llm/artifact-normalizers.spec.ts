import {
  AgentRole,
  type GenerationProvenance,
  normalizeDatabaseDesign,
  normalizeQaPlan,
  normalizeThreatModel,
  type DatabaseDesign,
  type QaPlan,
  type ThreatModel,
} from '@archivato/shared';
import { BaseAgent, degradedReasonFor } from './agent.base';
import type { LlmProvider } from './llm-provider.interface';
import { LlmHttpError, isGenerationFailure, isRequestTooLarge } from './llm-http';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { InMemoryThreatModelRepository } from '../threat-model/in-memory-threat-model.repository';
import { InMemoryQaPlanRepository } from '../qa-plan/in-memory-qa-plan.repository';

/**
 * A required array on a JSON-stored artifact going missing.
 *
 * This is the `statusCodes` bug repeating: the agent's `isValid` gates on ONE
 * field, a terser model omits another, `accept` spreads it through, and the store
 * hands it back with `row.data as unknown as X` — a claim, not a check. The rule
 * is one pure helper called at BOTH boundaries, and the read side is what heals a
 * row that is already in the table.
 */

const BASE = { sessionId: 's1', generatedAt: '2026-07-19T00:00:00.000Z' };

describe('normalizeDatabaseDesign', () => {
  it('reads a missing relations array as empty, not undefined', () => {
    // The exact shape that crashed DatabaseDesignView on `relations.length`.
    const stored = {
      ...BASE,
      databaseType: 'PostgreSQL',
      entities: [{ name: 'orders', description: 'Orders', columns: [] }],
    } as unknown as DatabaseDesign;

    expect(normalizeDatabaseDesign(stored).relations).toEqual([]);
  });

  it('backfills entities and their columns', () => {
    const stored = { ...BASE, databaseType: 'MySQL' } as unknown as DatabaseDesign;
    expect(normalizeDatabaseDesign(stored).entities).toEqual([]);

    const noColumns = {
      ...BASE,
      databaseType: 'MySQL',
      entities: [{ name: 'orders', description: 'x' }],
      relations: [],
    } as unknown as DatabaseDesign;
    expect(normalizeDatabaseDesign(noColumns).entities[0].columns).toEqual([]);
  });

  it('drops a relation that would render as "undefined → undefined"', () => {
    const stored = {
      ...BASE,
      databaseType: 'PostgreSQL',
      entities: [],
      relations: [
        { from: 'users', to: 'orders', type: 'one-to-many' },
        { to: 'orders', type: 'one-to-many' },
        null,
      ],
    } as unknown as DatabaseDesign;

    expect(normalizeDatabaseDesign(stored).relations).toHaveLength(1);
  });

  it('leaves a complete design untouched', () => {
    const good: DatabaseDesign = {
      ...BASE,
      databaseType: 'PostgreSQL',
      entities: [
        {
          name: 'users',
          description: 'People',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
        },
      ],
      relations: [{ from: 'users', to: 'orders', type: 'one-to-many' }],
    };

    expect(normalizeDatabaseDesign(good)).toEqual(good);
  });
});

describe('normalizeThreatModel', () => {
  it('backfills the arrays the agent never validated', () => {
    // `isValid` only ever checked `threats`, so these two reached the PUBLIC
    // share page as undefined.
    const stored = {
      ...BASE,
      summary: 'A pass.',
      threats: [
        {
          category: 'spoofing',
          component: 'Auth',
          threat: 'Credential stuffing',
          severity: 'high',
          mitigation: 'Rate limit',
        },
      ],
    } as unknown as ThreatModel;

    const out = normalizeThreatModel(stored);
    expect(out.trustBoundaries).toEqual([]);
    expect(out.assumptions).toEqual([]);
    expect(out.threats).toHaveLength(1);
  });

  it('drops a malformed threat and a non-string boundary', () => {
    const stored = {
      ...BASE,
      summary: '',
      trustBoundaries: ['Internet → API', 42, null],
      assumptions: [],
      threats: [{ category: 'spoofing' }, null],
    } as unknown as ThreatModel;

    const out = normalizeThreatModel(stored);
    expect(out.trustBoundaries).toEqual(['Internet → API']);
    expect(out.threats).toEqual([]);
  });
});

describe('normalizeQaPlan', () => {
  it('backfills all four unvalidated arrays', () => {
    const stored = {
      ...BASE,
      summary: 'A plan.',
      suites: [
        {
          name: 'Auth',
          type: 'unit',
          objective: 'x',
          cases: [{ id: 'TC-1', title: 'Login', expected: 'ok', priority: 'high' }],
        },
      ],
    } as unknown as QaPlan;

    const out = normalizeQaPlan(stored);
    expect(out.strategy).toEqual([]);
    expect(out.coverageGoals).toEqual([]);
    expect(out.tooling).toEqual([]);
    expect(out.outOfScope).toEqual([]);
    expect(out.suites[0].cases).toHaveLength(1);
  });

  it('backfills a suite with no cases array', () => {
    const stored = {
      ...BASE,
      summary: '',
      strategy: [],
      coverageGoals: [],
      tooling: [],
      outOfScope: [],
      suites: [{ name: 'Auth', type: 'unit' }],
    } as unknown as QaPlan;

    expect(normalizeQaPlan(stored).suites[0].cases).toEqual([]);
  });
});

/**
 * The read boundary is the half that matters for a row already in the table —
 * it is what makes an existing broken project render without regenerating it.
 * The in-memory repos normalize too, so a unit test cannot pass on a shape that
 * production would have had to repair.
 */
describe('the store heals a row written before the rule existed', () => {
  it('database design', async () => {
    const repo = new InMemoryDatabaseDesignRepository();
    await repo.upsert({
      ...BASE,
      databaseType: 'PostgreSQL',
      entities: [],
    } as unknown as DatabaseDesign);

    const read = await repo.findBySessionId('s1');
    expect(read!.relations).toEqual([]);
  });

  it('threat model', async () => {
    const repo = new InMemoryThreatModelRepository();
    await repo.upsert({ ...BASE, summary: '', threats: [] } as unknown as ThreatModel);

    const read = await repo.findBySessionId('s1');
    expect(read!.trustBoundaries).toEqual([]);
    expect(read!.assumptions).toEqual([]);
  });

  it('qa plan', async () => {
    const repo = new InMemoryQaPlanRepository();
    await repo.upsert({ ...BASE, summary: '', suites: [] } as unknown as QaPlan);

    const read = await repo.findBySessionId('s1');
    expect(read!.strategy).toEqual([]);
    expect(read!.tooling).toEqual([]);
  });
});

/**
 * The truncation that produced the missing `relations` in the first place.
 *
 * A seven-entity schema overran the provider's 2048-token default, Groq's
 * server-side JSON validation rejected its own model's cut-off output as a 400
 * `json_validate_failed`, and the whole design was discarded for the template.
 */
describe('a JSON-mode generation failure is not a call failure', () => {
  it('classifies Groq json_validate_failed as parse_error, not call_failed', () => {
    const groqBody = JSON.stringify({
      error: {
        message: "Failed to generate JSON. Please adjust your prompt.",
        type: 'invalid_request_error',
        code: 'json_validate_failed',
      },
    });

    const err = new LlmHttpError('Groq request failed with status 400', 400, false, 'http', groqBody);

    expect(isGenerationFailure(err)).toBe(true);
    // parse_error is the EXPENSIVE reason: the call succeeded and was billed, so
    // it points at the prompt/budget rather than at the network.
    expect(degradedReasonFor(err)).toBe('parse_error');
  });

  it('leaves a genuine transport failure classified as call_failed', () => {
    const badKey = new LlmHttpError('Groq request failed with status 401', 401, false, 'http', '{"error":{"code":"invalid_api_key"}}');
    expect(isGenerationFailure(badKey)).toBe(false);
    expect(degradedReasonFor(badKey)).toBe('call_failed');

    const timedOut = new LlmHttpError('timed out', null, true, 'timeout');
    expect(degradedReasonFor(timedOut)).toBe('timeout');
  });
});

/**
 * The 413 that a *bigger* budget caused: providers reserve `max_tokens` against
 * tokens-per-minute, so raising the schema budget to 8192 on a ~1.3K prompt
 * asked for 9,496 against Groq's 8,000 TPM and was refused before the model ran.
 */
describe('request-too-large handling', () => {
  const tooLarge = (status: number, detail: string) =>
    new LlmHttpError(`failed with status ${status}`, status, false, 'http', detail);

  it('recognises a size refusal on 413 and on a 400 that says so', () => {
    expect(
      isRequestTooLarge(
        tooLarge(413, 'Request too large ... on tokens per minute (TPM): Limit 8000, Requested 9496'),
      ),
    ).toBe(true);
    expect(isRequestTooLarge(tooLarge(400, 'please reduce your message size and try again'))).toBe(
      true,
    );
  });

  it('does not mistake other failures for a size refusal', () => {
    expect(isRequestTooLarge(tooLarge(429, 'rate limit reached on tokens per day'))).toBe(false);
    expect(isRequestTooLarge(tooLarge(401, 'invalid api key'))).toBe(false);
    expect(isRequestTooLarge(new Error('boom'))).toBe(false);
  });

  it('retries once at half the budget, then succeeds', async () => {
    const budgets: (number | undefined)[] = [];
    const llm = {
      name: 'mock',
      defaultModel: 'm',
      complete: async () => '',
      completeJson: async (_m: unknown, o?: { maxTokens?: number }) => {
        budgets.push(o?.maxTokens);
        if (budgets.length === 1) {
          throw tooLarge(413, 'Request too large ... tokens per minute (TPM): Limit 8000');
        }
        return { ok: true };
      },
    };

    class Probe extends BaseAgent {
      readonly role = AgentRole.DatabaseDesigner;
      protected readonly systemPrompt = 'p';
      run() {
        return this.generateArtifact<{ ok: boolean; generation?: GenerationProvenance }>({
          label: 'Probe',
          prompt: 'x',
          isValid: (r) => r?.ok === true,
          accept: (r) => ({ ok: true, ...r }) as { ok: boolean },
          fallback: () => ({ ok: false }),
          options: { maxTokens: 5120 },
        });
      }
    }

    const out = await new Probe(llm as unknown as LlmProvider).run();

    expect(budgets).toEqual([5120, 2560]);
    // It got a real artifact instead of the deterministic template.
    expect(out.ok).toBe(true);
    expect(out.generation?.mode).toBe('llm');
  });
});
