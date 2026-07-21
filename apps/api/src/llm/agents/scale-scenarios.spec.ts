/**
 * The two reported scenarios, driven end-to-end through the real agents.
 *
 * `scale-appropriate-design.spec.ts` covers the pure helpers in isolation. This
 * file is the acceptance test: it runs the actual `SystemArchitectAgent`,
 * `DatabaseDesignerAgent` and `ApiDesignerAgent` over the two scenarios and
 * checks the artifacts a client would actually receive.
 *
 * It runs on the **deterministic path** (`MockLlmProvider`), which is deliberate
 * and is the harder test of the two halves: an install with no LLM key ships
 * this output for every project, and the deterministic builders were
 * over-provisioning on their own — `inferTechStack` added Redis + BullMQ on the
 * word "notification" alone, which every product with a reminder contains. The
 * prompt changes cannot be asserted offline, so they are pinned separately by
 * `scale-prompt.spec.ts`.
 */

import {
  stripUnrequestedSupportTables,
  type DatabaseDesign,
  type RequirementDocument,
  type SlotMap,
  type SystemDesign,
} from '@archivato/shared';
import { SystemArchitectAgent } from './system-architect.agent';
import type { SystemDesignContext } from './system-architect.agent';
import { DatabaseDesignerAgent } from './database-designer.agent';
import { ApiDesignerAgent } from './api-designer.agent';
import { MockLlmProvider } from '../mock-llm.provider';

function slot(value: string): SlotMap[keyof SlotMap] {
  return { value, confidence: 'high', source: 'explicit' };
}

// ── scenario A: the reported lightweight task board ─────────────────────────

const TASK_BOARD_IDEA =
  'A lightweight task and reminder board for small teams.';

function taskBoardRequirements(): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    executiveSummary:
      'A simple shared board where a small team creates projects, tracks tasks, and gets reminded before work is due.',
    functional: [
      { id: 'FR-1', title: 'Create projects', description: 'Members can create a project and invite teammates.', priority: 'must' },
      { id: 'FR-2', title: 'Track tasks', description: 'Members can add tasks to a project, assign them, and mark them done.', priority: 'must' },
      { id: 'FR-3', title: 'Search tasks', description: 'A manager can search and filter tasks by assignee and status.', priority: 'should' },
      { id: 'FR-4', title: 'Comment on tasks', description: 'Members can leave a comment on a task.', priority: 'should' },
      { id: 'FR-5', title: 'Due reminders', description: 'Members receive a reminder notification before a task is due.', priority: 'must' },
    ],
    nonFunctional: [
      { id: 'NFR-1', category: 'security', description: 'Only signed-in team members can see a team\'s board.' },
      { id: 'NFR-2', category: 'usability', description: 'The board loads quickly on a laptop or phone.' },
    ],
    roles: [
      { name: 'Team Admin', description: 'Owns a team.', permissions: ['project:create', 'member:invite'] },
      { name: 'Member', description: 'Works on tasks.', permissions: ['task:create', 'task:update'] },
    ],
    businessRules: [{ id: 'BR-1', description: 'A task belongs to exactly one project.' }],
    constraints: [],
    assumptions: [],
  };
}

function taskBoardSlots(): SlotMap {
  return {
    scale_expectations: slot(
      '5-10 small teams, 30-50 active users at launch, growing to at most 300-400 active users after 6 months',
    ),
    budget_range: slot('$6,000 total, tight budget'),
    timeline: slot('6 weeks'),
  } as SlotMap;
}

// ── scenario B: the multi-branch enterprise counterweight ───────────────────

const CLINIC_IDEA =
  'A multi-branch healthcare platform for clinic groups operating across several cities.';

function clinicRequirements(): RequirementDocument {
  return {
    sessionId: 's2',
    generatedAt: '2026-07-21T00:00:00.000Z',
    executiveSummary:
      'An enterprise platform for clinic groups to run appointments, patient records and billing across every branch.',
    functional: [
      { id: 'FR-1', title: 'Book appointments', description: 'Patients book appointments at any branch of the group.', priority: 'must' },
      { id: 'FR-2', title: 'Patient records', description: 'Clinicians view and update the patient record for a visit.', priority: 'must' },
      { id: 'FR-3', title: 'Import lab results', description: 'Nightly bulk import of laboratory results from external providers.', priority: 'must' },
      { id: 'FR-4', title: 'Billing', description: 'Branches issue invoices and process insurance claims.', priority: 'must' },
      { id: 'FR-5', title: 'Reporting', description: 'Group managers report on utilisation per branch by date range.', priority: 'should' },
    ],
    nonFunctional: [
      { id: 'NFR-1', category: 'availability', description: 'High availability with failover; the platform is mission-critical for 40 clinics.' },
      { id: 'NFR-2', category: 'scalability', description: 'Supports 4,000 concurrent users at peak across 60,000 registered patients.' },
      { id: 'NFR-3', category: 'security', description: 'A full audit trail records who accessed or changed each patient record.' },
    ],
    roles: [
      { name: 'Clinician', description: 'Treats patients.', permissions: ['record:read', 'record:write'] },
      { name: 'Branch Manager', description: 'Runs one branch.', permissions: ['report:read'] },
      { name: 'Group Admin', description: 'Runs the clinic group.', permissions: ['branch:manage'] },
    ],
    businessRules: [{ id: 'BR-1', description: 'A clinician may only open records for their own branch.' }],
    constraints: ['Patient data must remain within the country.'],
    assumptions: [],
  };
}

function clinicSlots(): SlotMap {
  return {
    scale_expectations: slot('40 clinics, 60,000 registered patients, 4,000 concurrent users at peak'),
    budget_range: slot('$180,000 - $240,000'),
    timeline: slot('9 months'),
  } as SlotMap;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function architectCtx(
  idea: string,
  requirements: RequirementDocument,
  slots: SlotMap,
): SystemDesignContext {
  return { idea, intent: null, requirements, slots };
}

const stackText = (design: SystemDesign) =>
  design.techStack.map((t) => `${t.layer} ${t.technology}`).join(' ').toLowerCase();

// ── the acceptance tests ────────────────────────────────────────────────────

describe('small-scale scenario: the lightweight task board', () => {
  async function build() {
    const llm = new MockLlmProvider();
    const systemDesign = await new SystemArchitectAgent(llm).generate(
      's1',
      architectCtx(TASK_BOARD_IDEA, taskBoardRequirements(), taskBoardSlots()),
    );
    const requirements = taskBoardRequirements();
    const databaseDesign = await new DatabaseDesignerAgent(llm).generate('s1', {
      idea: TASK_BOARD_IDEA,
      intent: null,
      requirements,
      systemDesign,
    });
    const apiDesign = await new ApiDesignerAgent(llm).generate('s1', {
      idea: TASK_BOARD_IDEA,
      intent: null,
      requirements,
      systemDesign,
      databaseDesign,
    });
    return { systemDesign, databaseDesign, apiDesign };
  }

  it('identifies the Small/MVP tier and says why, from the real numbers', async () => {
    const { systemDesign } = await build();

    expect(systemDesign.scaleTier).toBe('small');
    // Auditable: the rationale has to carry the figure it was decided from, or an
    // owner cannot check the tier against their own requirement document.
    expect(systemDesign.scaleTierRationale).toContain('400');
  });

  it('recommends no cache and no job queue', async () => {
    const { systemDesign } = await build();
    const stack = stackText(systemDesign);

    expect(stack).not.toContain('redis');
    expect(stack).not.toContain('bullmq');
    expect(stack).not.toContain('queue');
    // …while still being a usable stack, not an empty one.
    expect(stack).toContain('postgres');
  });

  it('picks the simplest deployable architecture', async () => {
    const { systemDesign } = await build();
    expect(systemDesign.architecture).not.toBe('microservices');
  });

  it('adds no audit-log table', async () => {
    const { databaseDesign } = await build();
    const tables = databaseDesign.entities.map((e) => e.name.toLowerCase());

    expect(tables).not.toContain('audit_logs');
    expect(tables.some((t) => /audit|activity_log|change_log/.test(t))).toBe(false);
  });

  it('keeps the query surface proportional per entity', async () => {
    const { apiDesign } = await build();

    const listParams = (module: string) => {
      const group = apiDesign.modules.find((m) => m.name.toLowerCase().startsWith(module));
      const list = group?.endpoints.find(
        (e) => e.method === 'GET' && e.path === group.basePath,
      );
      return (list?.requestSchema ?? []).map((p) => p.name);
    };

    // Every list endpoint that exists is still paginated…
    for (const module of apiDesign.modules) {
      const list = module.endpoints.find(
        (e) => e.method === 'GET' && e.path === module.basePath,
      );
      if (!list) continue;
      const names = list.requestSchema.map((p) => p.name);
      expect(names).toContain('page');
      expect(names).toContain('limit');
    }

    // …but nothing the requirements never asked to search gets free-text search.
    const commentParams = listParams('comment');
    if (commentParams.length > 0) expect(commentParams).not.toContain('search');
  });
});

describe('large-scale scenario: the multi-branch clinic platform', () => {
  async function build() {
    const llm = new MockLlmProvider();
    const systemDesign = await new SystemArchitectAgent(llm).generate(
      's2',
      architectCtx(CLINIC_IDEA, clinicRequirements(), clinicSlots()),
    );
    const requirements = clinicRequirements();
    const databaseDesign = await new DatabaseDesignerAgent(llm).generate('s2', {
      idea: CLINIC_IDEA,
      intent: null,
      requirements,
      systemDesign,
    });
    return { systemDesign, databaseDesign };
  }

  it('identifies the Large/Enterprise tier', async () => {
    const { systemDesign } = await build();

    expect(systemDesign.scaleTier).toBe('large');
    expect(systemDesign.scaleTierRationale).toContain('60000');
  });

  it('STILL recommends the queue — the fix calibrates in both directions', async () => {
    // This is the test that stops the fix from being "permanently downgrade
    // every recommendation to keep it simple".
    const { systemDesign } = await build();
    const stack = stackText(systemDesign);

    expect(stack).toContain('queue');
    expect(stack).toContain('redis');
  });

  it('keeps the audit trail the requirements explicitly demand', async () => {
    // Asserted against the backstop directly, with a schema that actually
    // CONTAINS an audit table. The deterministic builder never invents one, so
    // reading the generated schema could only ever have produced a test that
    // passes whatever the code does — and the first version of this test did
    // exactly that (`hadAuditTable || tables.length > 0` is true for any
    // non-empty schema, so it could not fail).
    const { databaseDesign } = await build();
    const withAudit: DatabaseDesign = {
      ...databaseDesign,
      entities: [
        ...databaseDesign.entities,
        {
          name: 'audit_logs',
          description: 'Who accessed or changed each patient record.',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
        },
      ],
    };

    const { design, removed } = stripUnrequestedSupportTables(
      withAudit,
      clinicRequirements(),
    );

    expect(removed).toEqual([]);
    expect(design.entities.map((e) => e.name)).toContain('audit_logs');
  });
});
