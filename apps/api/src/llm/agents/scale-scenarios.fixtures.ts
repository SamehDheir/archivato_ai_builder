/**
 * The two reported scale scenarios, as one shared fixture.
 *
 * `scale-scenarios.spec.ts` runs them through the design chain and
 * `scale-operations.spec.ts` runs them on through the roadmap, QA plan, threat
 * model and review. They must be the SAME project in both files or the second
 * cannot answer the question it exists to answer — "does every stage size this
 * one project the same way". Two hand-maintained copies of a fixture drift by a
 * figure, and the drift would silently turn the cross-stage agreement test into
 * a test of two different projects that happen to agree.
 *
 * Not a `.spec.ts` (jest's `testRegex` would demand tests in it) and excluded
 * from the API build, so it never reaches `dist`.
 */

import type { RequirementDocument, SlotMap } from '@archivato/shared';

export function slot(value: string): SlotMap[keyof SlotMap] {
  return { value, confidence: 'high', source: 'explicit' };
}

// ── scenario A: the reported lightweight task board ─────────────────────────

export const TASK_BOARD_IDEA =
  'A lightweight task and reminder board for small teams.';

export function taskBoardRequirements(): RequirementDocument {
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

export function taskBoardSlots(): SlotMap {
  return {
    scale_expectations: slot(
      '5-10 small teams, 30-50 active users at launch, growing to at most 300-400 active users after 6 months',
    ),
    budget_range: slot('$6,000 total, tight budget'),
    timeline: slot('6 weeks'),
  } as SlotMap;
}

// ── scenario B: the multi-branch enterprise counterweight ───────────────────

export const CLINIC_IDEA =
  'A multi-branch healthcare platform for clinic groups operating across several cities.';

export function clinicRequirements(): RequirementDocument {
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

export function clinicSlots(): SlotMap {
  return {
    scale_expectations: slot('40 clinics, 60,000 registered patients, 4,000 concurrent users at peak'),
    budget_range: slot('$180,000 - $240,000'),
    timeline: slot('9 months'),
  } as SlotMap;
}
