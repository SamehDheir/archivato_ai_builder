import type {
  ApiDesign,
  DatabaseDesign,
  RequirementDocument,
  SystemDesign,
} from '@archivato/shared';
import { ReviewerAgent } from './reviewer.agent';
import { SystemArchitectAgent } from './system-architect.agent';
import { DatabaseDesignerAgent } from './database-designer.agent';
import { describeShape } from '../agent.base';
import type { LlmCompleteOptions, LlmProvider } from '../llm-provider.interface';

/**
 * Every agent whose artifact outgrew the provider default must ask for room.
 *
 * This exists because the same bug shipped three times. An agent that passes no
 * `options` inherits the provider's default output ceiling (Groq: **2048**), and
 * when the artifact outgrows it the response is cut off mid-JSON. That failure
 * is silent by construction:
 *
 *   - `parseJsonFromLlm` falls back to "the widest balanced slice", so truncated
 *     output **parses cleanly** into a partial object rather than throwing;
 *   - the missing keys are whichever the schema lists LAST;
 *   - so an agent whose `isValid` checks a late key falls back to its template
 *     (the reviewer), and one whose `isValid` checks only early keys **persists
 *     the short artifact** (the architect) — the quieter and worse outcome.
 *
 * Measured on a real 12-entity project: reviewer and architect both returned
 * `completionTokens: 2048` — the cap, exactly — on consecutive runs, and the
 * stored design carried three services for twelve entities.
 *
 * A budget can only be verified where it is actually sent, so this asserts on
 * the options handed to the provider. Adding an agent with a large artifact
 * means adding it here.
 */

/** Records the options each agent passes, and returns junk so the path is uniform. */
function recordingLlm(): {
  llm: LlmProvider;
  lastOptions: () => LlmCompleteOptions | undefined;
} {
  let seen: LlmCompleteOptions | undefined;
  const llm = {
    name: 'recording',
    complete: async () => '{}',
    completeJson: async (_messages: unknown, options?: LlmCompleteOptions) => {
      seen = options;
      // Deliberately unusable: every agent then takes its fallback path, so the
      // assertion is about the REQUEST, never about a scripted response.
      return {} as never;
    },
  } as unknown as LlmProvider;
  return { llm, lastOptions: () => seen };
}

const requirements: RequirementDocument = {
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  functional: [
    { id: 'FR-1', title: 'Book an appointment', description: 'Patients book online.', priority: 'must' },
  ],
  nonFunctional: [],
  roles: [],
  businessRules: [],
  constraints: [],
  assumptions: [],
};

const systemDesign: SystemDesign = {
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  architecture: 'modular_monolith',
  architectureRationale: 'Simple to operate.',
  techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'Typed.' }],
  services: [{ name: 'Appointments', responsibility: 'Booking', dependencies: [] }],
};

const databaseDesign: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  databaseType: 'PostgreSQL',
  entities: [
    { name: 'appointments', description: 'A booking', columns: [{ name: 'id', type: 'uuid', nullable: false }] },
  ],
  relations: [],
};

const apiDesign: ApiDesign = {
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  modules: [],
};

/** The floor: anything above the Groq default, which is what truncated. */
const PROVIDER_DEFAULT = 2048;

describe('agent output budgets', () => {
  it('the reviewer asks for room — it inherited the default and was truncated', async () => {
    const { llm, lastOptions } = recordingLlm();
    await new ReviewerAgent(llm).generate('s1', {
      idea: 'A clinic platform',
      intent: null,
      requirements,
      systemDesign,
      databaseDesign,
      apiDesign,
    });

    expect(lastOptions()?.maxTokens).toBeGreaterThan(PROVIDER_DEFAULT);
  });

  it('the system architect asks for room — its truncation persisted a short design', async () => {
    const { llm, lastOptions } = recordingLlm();
    await new SystemArchitectAgent(llm).generate('s1', {
      idea: 'A clinic platform',
      intent: null,
      requirements,
    });

    expect(lastOptions()?.maxTokens).toBeGreaterThan(PROVIDER_DEFAULT);
  });

  it('the database designer still asks for room (the original fix, kept)', async () => {
    const { llm, lastOptions } = recordingLlm();
    await new DatabaseDesignerAgent(llm).generate('s1', {
      idea: 'A clinic platform',
      intent: null,
      requirements,
      systemDesign,
    });

    expect(lastOptions()?.maxTokens).toBeGreaterThan(PROVIDER_DEFAULT);
  });
});

/**
 * The log line is the diagnostic that was missing. A bare "malformed" cost a
 * `llm_usage` query to explain; the returned key list identifies truncation on
 * sight (the tail of the schema is absent).
 */
describe('describeShape', () => {
  it('lists the keys that came back, so a missing tail is visible', () => {
    expect(describeShape({ overallScore: 70, scores: {}, securityIssues: [] })).toBe(
      '{ overallScore, scores, securityIssues }',
    );
  });

  it('never prints values — the response is built from the client’s own words', () => {
    const shape = describeShape({ summary: 'Acme Corp is losing $2M a year' });
    expect(shape).toBe('{ summary }');
    expect(shape).not.toContain('Acme');
  });

  it('describes the non-object shapes without throwing', () => {
    expect(describeShape(null)).toBe('null');
    expect(describeShape(undefined)).toBe('undefined');
    expect(describeShape([1, 2, 3])).toBe('array(3)');
    expect(describeShape('text')).toBe('string');
    expect(describeShape({})).toBe('{} (no keys)');
  });
});
