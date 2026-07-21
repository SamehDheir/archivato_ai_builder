/**
 * What the design agents actually SEND — the primary defence.
 *
 * The offline scenario tests pin the deterministic builders and the code
 * backstops. Neither can see the half of this fix that matters most on a real
 * run: what the model is told. Two of the three root causes were prompt text,
 * and one of them was a *schema example* nobody would think to grep for —
 *
 *   `techStack[]: {layer (e.g. backend, frontend, database, cache, queue, auth) …}`
 *
 * A model reads an enumeration inside a schema as a checklist to fill, so naming
 * `cache` and `queue` there invited both onto every design regardless of scale.
 * A prompt is only real where it is sent, so this asserts on the string handed
 * to the provider (the `output-budget.spec.ts` pattern).
 */

import type { RequirementDocument, SlotMap, SystemDesign } from '@archivato/shared';
import { SystemArchitectAgent } from './system-architect.agent';
import { DatabaseDesignerAgent } from './database-designer.agent';
import { RequirementEngineerAgent } from './requirement-engineer.agent';
import type { LlmProvider } from '../llm-provider.interface';

/** Records every prompt sent, then fails the call so the fallback path runs. */
function recordingLlm(): { llm: LlmProvider; prompts: () => string } {
  const seen: string[] = [];
  const llm = {
    name: 'recording',
    complete: async () => '{}',
    completeJson: async (messages: unknown) => {
      seen.push(JSON.stringify(messages));
      return {} as never;
    },
  } as unknown as LlmProvider;
  return { llm, prompts: () => seen.join('\n') };
}

function slot(value: string): SlotMap[keyof SlotMap] {
  return { value, confidence: 'high', source: 'explicit' };
}

const smallRequirements: RequirementDocument = {
  sessionId: 's1',
  generatedAt: '2026-07-21T00:00:00.000Z',
  functional: [
    { id: 'FR-1', title: 'Track tasks', description: 'Members add and complete tasks.', priority: 'must' },
    { id: 'FR-2', title: 'Due reminders', description: 'Members get a reminder before a task is due.', priority: 'must' },
  ],
  nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'Only team members can see the board.' }],
  roles: [{ name: 'Member', description: 'Works on tasks.', permissions: ['task:create'] }],
  businessRules: [],
  constraints: [],
  assumptions: [],
};

const smallSlots = {
  scale_expectations: slot('30-50 active users at launch, up to 400 active users after 6 months'),
  budget_range: slot('$6,000, tight budget'),
  timeline: slot('6 weeks'),
} as SlotMap;

describe('System Architect prompt', () => {
  it('no longer offers cache and queue as example tech-stack layers', async () => {
    const { llm, prompts } = recordingLlm();
    await new SystemArchitectAgent(llm).generate('s1', {
      idea: 'A lightweight task and reminder board for small teams.',
      intent: null,
      requirements: smallRequirements,
      slots: smallSlots,
    });

    const sent = prompts();
    expect(sent).toContain('techStack[]');
    expect(sent).not.toMatch(/database, cache, queue/);
  });

  it('states the tier as a verdict, with the evidence and an infrastructure budget', async () => {
    const { llm, prompts } = recordingLlm();
    await new SystemArchitectAgent(llm).generate('s1', {
      idea: 'A lightweight task and reminder board for small teams.',
      intent: null,
      requirements: smallRequirements,
      slots: smallSlots,
    });

    const sent = prompts();
    expect(sent).toContain('SCALE TIER');
    expect(sent).toContain('SMALL');
    // The evidence travels with the verdict: told only "you are small", a model
    // second-guesses the label against its priors.
    expect(sent).toContain('400 expected users');
    expect(sent).toContain('INFRASTRUCTURE BUDGET');
    // The prohibition names the things it forbids, and the escape hatch.
    expect(sent).toMatch(/Redis/);
    expect(sent).toMatch(/BullMQ/);
    expect(sent).toContain('The ONLY exception');
  });

  it('sends the LARGE budget instead when the numbers are large', async () => {
    const { llm, prompts } = recordingLlm();
    await new SystemArchitectAgent(llm).generate('s2', {
      idea: 'A multi-branch enterprise healthcare platform.',
      intent: null,
      requirements: {
        ...smallRequirements,
        nonFunctional: [
          { id: 'NFR-1', category: 'availability', description: 'Mission-critical, high availability across 40 branches.' },
        ],
      },
      slots: {
        scale_expectations: slot('60,000 registered patients, 4,000 concurrent users'),
        budget_range: slot('$180,000 - $240,000'),
        timeline: slot('9 months'),
      } as SlotMap,
    });

    const sent = prompts();
    expect(sent).toContain('LARGE');
    expect(sent).toContain('Large/Enterprise tier');
    expect(sent).not.toContain('Do NOT include a cache');
  });
});

describe('Database Designer prompt', () => {
  const systemDesign = {
    sessionId: 's1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    architecture: 'modular_monolith',
    architectureRationale: 'Simplest deployable.',
    techStack: [{ layer: 'database', technology: 'PostgreSQL', rationale: 'Relational.' }],
    services: [{ name: 'Tasks', responsibility: 'Task records.', dependencies: [] }],
  } as SystemDesign;

  it('tells the model NOT to add an audit log when nothing asked for one', async () => {
    const { llm, prompts } = recordingLlm();
    await new DatabaseDesignerAgent(llm).generate('s1', {
      idea: 'A lightweight task board.',
      intent: null,
      requirements: smallRequirements,
      systemDesign,
    });

    const sent = prompts();
    expect(sent).toContain('AUDIT TRAIL');
    expect(sent).toContain('Do NOT add an audit_logs');
    // The line that used to fire on every project is gone. Its condition —
    // "restrict who may read or change records" — is satisfied by every app
    // with roles, so it was a default wearing a conditional's clothes.
    expect(sent).not.toContain('restrict who may read or change records');
  });

  it('asks for the audit log when the requirements demand one', async () => {
    const { llm, prompts } = recordingLlm();
    await new DatabaseDesignerAgent(llm).generate('s2', {
      idea: 'A clinic platform.',
      intent: null,
      requirements: {
        ...smallRequirements,
        nonFunctional: [
          {
            id: 'NFR-1',
            category: 'security',
            description: 'A full audit trail records who accessed each patient record.',
          },
        ],
      },
      systemDesign,
    });

    const sent = prompts();
    expect(sent).toContain('the requirements call for one');
    expect(sent).not.toContain('Do NOT add an audit_logs');
  });
});

describe('Requirement Engineer prompt', () => {
  it('asks the model to separate open questions from assumptions', async () => {
    const { llm, prompts } = recordingLlm();
    await new RequirementEngineerAgent(llm).generate('s1', {
      idea: 'A lightweight task board.',
      intent: null,
      summary: {
        goal: 'Track team tasks.',
        users: ['Member'],
        features: ['Task tracking'],
        businessRules: [],
        constraints: [],
        assumptions: [],
      },
      history: [],
    } as never);

    const sent = prompts();
    expect(sent).toContain('open_question');
    // The reported line is named in the prompt, because a rule stated abstractly
    // ("distinguish stakes") is one a model applies inconsistently.
    expect(sent).toContain('Microsoft Teams or Slack');
    expect(sent).toContain('placeholder');
  });
});
