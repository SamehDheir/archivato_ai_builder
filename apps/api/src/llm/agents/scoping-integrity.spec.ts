import {
  EXTRACTION_GAP_ASSUMPTION,
  InterviewPhase,
  roleIsSourced,
  sharesVerbatimSpan,
  transcriptSuggestsBusinessRules,
  unsourcedRoleNames,
  type InterviewExchange,
  type RequirementsSummary,
  type SlotMap,
  type SlotValue,
} from '@archivato/shared';
import { RequirementEngineerAgent } from './requirement-engineer.agent';
import { SystemArchitectAgent } from './system-architect.agent';
import { MockLlmProvider } from '../mock-llm.provider';
import { summaryFromSlots } from '../../interview/slots';

/**
 * Root-cause regression for the field-provenance bug the user reported across
 * repeated runs of two unrelated projects: every structured summary field is
 * supposed to be a synthesized extraction from ITS OWN source answer, and
 * instead a field would (1) reproduce another field's answer verbatim, (2)
 * render silently empty while the transcript plainly contained material, or (3)
 * assert content — a role, a region — the client never stated.
 *
 * The pure-function tests below pin the detectors. The full-pipeline block runs
 * a NEW domain the user had not tested (field-services scheduling) end to end on
 * the deterministic path — the same path that shipped the reported artifacts —
 * and asserts all three failure modes are absent.
 */

const explicit = (value: string): SlotValue => ({
  value,
  confidence: 'high',
  source: 'explicit',
});

// ── pure detectors ───────────────────────────────────────────────────────────

describe('roleIsSourced / unsourcedRoleNames', () => {
  const stated = 'Admin, Dispatcher, Field Technician, Customer';

  it('accepts a role the client named', () => {
    expect(roleIsSourced('Dispatcher', stated)).toBe(true);
    expect(roleIsSourced('Field Technician', stated)).toBe(true);
  });

  it('rejects the reported invented role that merely shares one word', () => {
    // "Customer Service" shares "customer" with the stated "Customer" role — a
    // token-overlap matcher would wave it through. Containment asks for
    // "service" too, and correctly finds it absent.
    expect(roleIsSourced('Customer Service', stated)).toBe(false);
    expect(unsourcedRoleNames(['Customer', 'Customer Service'], stated)).toEqual([
      'Customer Service',
    ]);
  });

  it('makes no claim when no roles were stated', () => {
    // No evidence yields no finding — never a default that flags everything.
    expect(unsourcedRoleNames(['Anything', 'At All'], '')).toEqual([]);
  });

  it('does not flag a role whose name is pure filler it cannot assess', () => {
    expect(roleIsSourced('Team Member', stated)).toBe(true);
  });
});

describe('sharesVerbatimSpan', () => {
  const scaleAnswer =
    'We expect about 50 branches with 2000 daily active users and roughly ' +
    'one million patient records in the first year of operation';

  it('detects a whole clause pasted from another field', () => {
    // The reported bleed: the Scale paragraph reproduced inside Constraints.
    expect(sharesVerbatimSpan(scaleAnswer, scaleAnswer)).toBe(true);
    expect(
      sharesVerbatimSpan(
        `Constraint: ${scaleAnswer}. Must run on-premise.`,
        scaleAnswer,
      ),
    ).toBe(true);
  });

  it('does not fire on two genuinely distinct answers', () => {
    expect(
      sharesVerbatimSpan(
        'The platform must run on the client’s own servers and integrate with SAP.',
        scaleAnswer,
      ),
    ).toBe(false);
  });

  it('ignores a short incidental phrase overlap', () => {
    expect(sharesVerbatimSpan('orders per day', 'we handle orders per day', 8)).toBe(
      false,
    );
  });
});

describe('transcriptSuggestsBusinessRules', () => {
  it('detects policy language the reporter cited as dropped', () => {
    expect(
      transcriptSuggestsBusinessRules(
        'Lab results must be flagged if the value is critical.',
      ),
    ).toBe(true);
    expect(
      transcriptSuggestsBusinessRules(
        'Inventory should auto-decrement and trigger a reorder at the threshold.',
      ),
    ).toBe(true);
  });

  it('stays quiet on plain description with no rule language', () => {
    expect(
      transcriptSuggestsBusinessRules(
        'The dashboard shows a list of jobs and a calendar of upcoming visits.',
      ),
    ).toBe(false);
  });
});

// ── new-domain full-pipeline regression: field-services scheduling ───────────
//
// A domain deliberately outside the two the user tested. The transcript carries
// real policy language and a role the client explicitly did NOT staff, so it
// exercises every failure mode at once.

const FS_SLOTS: SlotMap = {
  business_domain: explicit(
    'Field-services scheduling — dispatching HVAC technicians to on-site jobs',
  ),
  target_users_roles: explicit('Dispatcher, Field Technician, Customer'),
  target_market: explicit('United Arab Emirates'),
  core_workflows: explicit(
    '1. Dispatcher creates a job and assigns it to an available technician. ' +
      '2. Technician receives the job on mobile, travels, and marks it complete with photos. ' +
      '3. Customer receives an SMS with the technician’s ETA. ' +
      '4. Invoice is generated automatically when a job is marked complete. ' +
      '5. Recurring maintenance visits are scheduled on a fixed interval.',
  ),
  data_entities: explicit('Job, Technician, Customer, Invoice, MaintenanceContract'),
  integrations: explicit('SMS gateway, accounting software'),
  scale_expectations: explicit(
    'About 30 technicians handling 200 jobs per day across the Emirates',
  ),
  constraints: explicit('Must integrate with the client’s existing QuickBooks account'),
  budget_range: explicit('$15,000'),
  timeline: explicit('12 weeks'),
};

const FS_HISTORY: InterviewExchange[] = [
  {
    question: { id: 'q1', phase: InterviewPhase.Understanding, prompt: 'Walk me through a job.' },
    answer:
      'A dispatcher creates a job and must assign it to a technician who is available. ' +
      'A technician cannot be double-booked. When a job is marked complete an invoice ' +
      'is generated automatically. Recurring maintenance jobs trigger a new visit every 90 days.',
  },
  {
    question: { id: 'q2', phase: InterviewPhase.Understanding, prompt: 'Who works in the system?' },
    answer:
      'Dispatchers and field technicians. Customer service is not a separate role yet — ' +
      'the dispatcher handles customer calls for now.',
  },
];

function fsSummary(): RequirementsSummary {
  const d = summaryFromSlots(FS_SLOTS);
  return {
    goal: 'Dispatch HVAC technicians to on-site jobs and bill them automatically.',
    users: d.users ?? [],
    features: d.features ?? [],
    businessRules: [],
    constraints: d.constraints ?? [],
    scale: d.scale,
    assumptions: [],
  };
}

async function fsRequirements() {
  const agent = new RequirementEngineerAgent(new MockLlmProvider());
  return agent.generate('fs', {
    idea: 'A scheduling tool for an HVAC field-service company',
    intent: null,
    history: FS_HISTORY,
    summary: fsSummary(),
    slots: FS_SLOTS,
    openQuestions: [],
  });
}

describe('field-services scoping regression (new domain, deterministic path)', () => {
  it('never puts the scale answer inside constraints (no verbatim bleed)', () => {
    const summary = fsSummary();
    const scaleText = FS_SLOTS.scale_expectations!.value;

    // Scale has its own field; constraints holds only the constraints answer.
    expect(summary.scale?.join(' ')).toContain('technicians');
    for (const constraint of summary.constraints) {
      expect(sharesVerbatimSpan(constraint, scaleText)).toBe(false);
    }
    expect(summary.constraints.join(' ')).toContain('QuickBooks');
  });

  it('keeps scale as its own scalability requirement in the document', async () => {
    const doc = await fsRequirements();
    const scale = doc.nonFunctional.filter((n) => n.category === 'scalability');
    expect(scale.length).toBeGreaterThan(0);
    expect(scale.map((n) => n.description).join(' ')).toMatch(/technician|job/i);

    // And it is NOT duplicated verbatim into the constraints list.
    for (const c of doc.constraints) {
      expect(sharesVerbatimSpan(c, FS_SLOTS.scale_expectations!.value)).toBe(false);
    }
  });

  it('lists only the roles the client named', async () => {
    const doc = await fsRequirements();
    const names = doc.roles.map((r) => r.name.toLowerCase());
    // The client explicitly said customer service is not a separate role.
    expect(names.some((n) => n.includes('customer service'))).toBe(false);
  });

  it('flags an inferred role as an assumption instead of asserting it', async () => {
    // Script a model reply whose roles include one the client never named —
    // exactly what the model sometimes does — and drive it through the PUBLIC
    // generate() so the provenance pass and screening both run. A shared-token
    // matcher would let "Customer Service" pass on the stated "Customer" role;
    // it must instead be surfaced as an inference.
    const mock = new MockLlmProvider();
    mock.enqueueJson({
      executiveSummary: 'A scheduling tool for HVAC field-service teams.',
      functional: [
        { id: 'FR-1', title: 'Create jobs', description: 'Dispatchers can create jobs.', priority: 'must' },
      ],
      nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'Data is encrypted.' }],
      roles: [
        { name: 'Dispatcher', description: 'Assigns jobs.', permissions: ['assign'] },
        { name: 'Customer Service', description: 'Handles calls.', permissions: ['call'] },
      ],
      businessRules: [{ id: 'BR-1', description: 'A technician cannot be double-booked.' }],
      constraints: [],
      assumptions: [],
      assumptionsAndOpenQuestions: [],
    });
    const doc = await new RequirementEngineerAgent(mock).generate('fs', {
      idea: 'A scheduling tool for an HVAC field-service company',
      intent: null,
      history: FS_HISTORY,
      summary: fsSummary(),
      slots: FS_SLOTS,
      openQuestions: [],
    });

    // The role is kept (it may be a correct inference) but surfaced honestly.
    expect(doc.roles.map((r) => r.name)).toContain('Customer Service');
    const assumptions = (doc.assumptionsAndOpenQuestions ?? [])
      .map((a) => a.assumption)
      .join(' ');
    expect(assumptions).toMatch(/customer service/i);
    expect(assumptions).toMatch(/inferred/i);
  });

  it('labels an empty business-rules section as an extraction gap when the transcript has rules', async () => {
    const doc = await fsRequirements();
    // The deterministic path derives no business rules (there is no rule slot),
    // but the transcript is full of them ("cannot be double-booked", "invoice is
    // generated automatically", "every 90 days"). So the gap must be named.
    if (doc.businessRules.length === 0) {
      const assumptions = (doc.assumptionsAndOpenQuestions ?? [])
        .map((a) => a.assumption)
        .join(' ');
      expect(assumptions).toContain(EXTRACTION_GAP_ASSUMPTION.slice(0, 40));
    }
  });

  it('surfaces FR-to-service coverage consistently across identical runs', async () => {
    // The reported symptom was *inconsistency*: the same FR had an owning service
    // on one run and not the next. The root cause is LLM non-determinism; the
    // codebase's answer is to compute coverage deterministically and SURFACE any
    // gap (`uncoveredRequirements`, owner-only) rather than silently invent a
    // service — which would move complexity → effort → the price. So the
    // invariant is: two identical runs produce the identical, visible gap set.
    const requirements = await fsRequirements();
    const run = async () =>
      new SystemArchitectAgent(new MockLlmProvider()).generate('fs', {
        idea: 'A scheduling tool for an HVAC field-service company',
        intent: null,
        requirements,
        slots: FS_SLOTS,
      });
    const [a, b] = await Promise.all([run(), run()]);

    expect(a.uncoveredRequirements ?? []).toEqual(b.uncoveredRequirements ?? []);
    // A gap is never silently dropped: any uncovered FR is a real id from the doc.
    const ids = new Set(requirements.functional.map((f) => f.id));
    for (const gap of a.uncoveredRequirements ?? []) expect(ids.has(gap)).toBe(true);
  });

  it('never asserts an unstated hosting region or law as fact', async () => {
    const doc = await fsRequirements();
    const json = JSON.stringify(doc);
    // UAE was stated, so its regime is fine to name; a wrong one is not.
    expect(json).not.toMatch(/\bHIPAA\b/);
    expect(json).not.toMatch(/\bGDPR\b/);
  });

  it('still never states the budget or timeline', async () => {
    const json = JSON.stringify(await fsRequirements());
    expect(json).not.toContain('$15,000');
    expect(json).not.toContain('12 weeks');
  });
});
