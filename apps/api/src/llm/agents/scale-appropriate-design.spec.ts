/**
 * Scale-appropriate design — the over-engineering regression suite.
 *
 * The reported failure: a client described "a lightweight task and reminder board
 * for small teams", stated 30–50 users at launch growing to 300–400, and received
 * Redis, BullMQ, a Vercel + AWS RDS hybrid, an `audit_logs` table, and multi-field
 * filtering on all six entities. Nothing was broken; nothing had ever *decided*
 * how big the system was, so each agent fell back on what a professional SaaS
 * usually has — which is the largest system in its training data.
 *
 * Every test here runs the two scenarios the fix has to satisfy **in both
 * directions**. A change that only ever simplifies would pass half of this file
 * and be a different bug: an enterprise project that loses its queue fails under
 * load, and the client feels that one.
 */

import {
  assessScaleTier,
  buildRestApi,
  enforceQuerySurface,
  enforceScaleAppropriateStack,
  listQueryParams,
  needsAsyncProcessing,
  queryDemandFor,
  requiresAuditLog,
  scaleTierRationale,
  stripUnrequestedSupportTables,
  type DatabaseDesign,
  type Entity,
  type RequirementDocument,
} from '@archivato/shared';

// ── the two scenarios ───────────────────────────────────────────────────────

/** The reported case: a lightweight internal task board. */
const SMALL_SCALE = {
  scaleText:
    '5-10 small teams, 30-50 active users at launch, growing to at most 300-400 active users after 6 months',
  budgetText: '$6,000',
  timelineText: '6 weeks',
  descriptionText:
    'A lightweight task and reminder board for small teams. Members create projects, ' +
    'add tasks, comment on them, and receive a reminder before a task is due.',
};

/** The counterweight: a multi-branch HealthTech platform. */
const LARGE_SCALE = {
  scaleText: '40 clinics, 60,000 registered patients, 4,000 concurrent users at peak',
  budgetText: '$180,000 - $240,000',
  timelineText: '9 months',
  descriptionText:
    'A multi-branch healthcare platform for clinic groups, with high availability ' +
    'requirements, nightly bulk import of laboratory results, and audit trail ' +
    'obligations under the patient record retention policy.',
};

function requirements(partial: Partial<RequirementDocument>): RequirementDocument {
  return {
    sessionId: 's1',
    generatedAt: new Date().toISOString(),
    functional: [],
    nonFunctional: [],
    roles: [],
    businessRules: [],
    constraints: [],
    assumptions: [],
    ...partial,
  } as RequirementDocument;
}

// ── 1. the tier itself ──────────────────────────────────────────────────────

describe('assessScaleTier', () => {
  it('reads the reported lightweight task board as the small tier', () => {
    const assessment = assessScaleTier(SMALL_SCALE);

    expect(assessment.tier).toBe('small');
    // The growth figure, not the launch figure — designing to 30 users when the
    // client said 400 would be under-building on purpose.
    expect(assessment.statedUsers).toBe(400);
    expect(assessment.unstated).toBe(false);
  });

  it('reads the multi-branch health platform as the large tier', () => {
    const assessment = assessScaleTier(LARGE_SCALE);

    expect(assessment.tier).toBe('large');
    expect(assessment.statedUsers).toBe(60_000);
  });

  it('lands on medium — never an extreme — when nothing was stated', () => {
    const assessment = assessScaleTier({});

    expect(assessment.tier).toBe('medium');
    expect(assessment.unstated).toBe(true);
    expect(assessment.statedUsers).toBeNull();
  });

  it('lets a stated figure outweigh adjectives, in both directions', () => {
    // "Enterprise-grade" over 300 users cannot conjure a multi-region system…
    const inflated = assessScaleTier({
      scaleText: '300 users',
      descriptionText: 'An enterprise-grade mission-critical platform.',
    });
    expect(inflated.tier).toBe('medium'); // one step up from small, never two

    // …and "simple" over 60,000 users cannot talk a real system down to one box.
    const deflated = assessScaleTier({
      scaleText: '60,000 users',
      descriptionText: 'A simple lightweight tool.',
    });
    expect(deflated.tier).toBe('medium'); // one step down from large, never two
  });

  it('never reads a bare year as a user count', () => {
    // "customers since 2019" used to yield 2019 users and size the whole design
    // from a fabricated figure — the opposite of the "null, never a guess" rule.
    expect(
      assessScaleTier({ descriptionText: 'Serving customers since 2019.' })
        .statedUsers,
    ).toBeNull();
    // The explicit form still reads.
    expect(assessScaleTier({ scaleText: 'users: 500' }).statedUsers).toBe(500);
  });

  it('takes the largest figure across BOTH sources, not the first that matches', () => {
    // A scale slot stating only the launch figure used to stop the search, so a
    // far larger NFR figure was never read and the design was sized to 50.
    const assessment = assessScaleTier({
      scaleText: '30-50 active users at launch',
      descriptionText: 'The platform must support 4,000 concurrent users at peak.',
    });

    expect(assessment.statedUsers).toBe(4_000);
    expect(assessment.tier).toBe('medium');
  });

  it('keeps the timeline qualitative in the client-facing rationale', () => {
    // The rationale is stored on the design and the share page renders it, so
    // R7/R8's "never restate the exact figure or date" applies to it.
    const rationale = scaleTierRationale(assessScaleTier(SMALL_SCALE), 'en');

    expect(rationale).not.toContain('6-week');
    expect(rationale).toContain('a short delivery window');
    expect(rationale).toContain('a limited budget');
  });

  it('reads Arabic figures and self-description', () => {
    const assessment = assessScaleTier({
      scaleText: '٥٠ مستخدم',
      descriptionText: 'أداة داخلية بسيطة لفريق صغير.',
    });

    expect(assessment.tier).toBe('small');
    expect(assessment.statedUsers).toBe(50);
  });

  it('writes the rationale in the artifact language, with the figure intact', () => {
    const assessment = assessScaleTier(SMALL_SCALE);

    const en = scaleTierRationale(assessment, 'en');
    expect(en).toContain('Small / MVP');
    expect(en).toContain('400');

    // Localized as whole sentences, not English prose with an Arabic word dropped
    // in — the half-translated failure this codebase fixed once already.
    const ar = scaleTierRationale(assessment, 'ar');
    expect(ar).toContain('صغير');
    expect(ar).toContain('400');
    expect(ar).not.toMatch(/[A-Za-z]{4,}/);
  });
});

// ── 2. infrastructure: no queue/cache without a reason ──────────────────────

describe('enforceScaleAppropriateStack', () => {
  const overBuilt = [
    { layer: 'backend', technology: 'NestJS', rationale: 'Modular.' },
    { layer: 'database', technology: 'PostgreSQL', rationale: 'Relational.' },
    { layer: 'cache', technology: 'Redis', rationale: 'Performance.' },
    { layer: 'queue', technology: 'BullMQ + Redis', rationale: 'Reminders.' },
  ];

  it('strips the cache and queue from the reported small-tier design', () => {
    const reminders =
      'Members receive a reminder notification before a task is due. ' +
      'The system sends an email when a task is assigned.';

    const { techStack, removed } = enforceScaleAppropriateStack(
      overBuilt,
      'small',
      reminders,
    );

    expect(techStack.map((t) => t.technology)).toEqual(['NestJS', 'PostgreSQL']);
    expect(removed).toEqual(['Redis', 'BullMQ + Redis']);
  });

  it('keeps them when a requirement genuinely cannot run synchronously', () => {
    const { techStack, removed } = enforceScaleAppropriateStack(
      overBuilt,
      'small',
      'Nightly bulk import of supplier catalogues, with video processing for uploads.',
    );

    expect(removed).toEqual([]);
    expect(techStack).toHaveLength(4);
  });

  it('never touches a medium or large design', () => {
    for (const tier of ['medium', 'large'] as const) {
      const { techStack, removed } = enforceScaleAppropriateStack(
        overBuilt,
        tier,
        'Members receive a reminder before a task is due.',
      );
      expect(removed).toEqual([]);
      expect(techStack).toHaveLength(4);
    }
  });

  it('does not read "send a notification" as async work', () => {
    // This is the exact feature that justified BullMQ + Redis for 400 users.
    expect(
      needsAsyncProcessing('Send the user a reminder notification by email.'),
    ).toBe(false);
    expect(needsAsyncProcessing('Nightly bulk export of all records.')).toBe(true);
  });

  it('does not read OUR OWN rate limiting or DB migrations as async work', () => {
    // Both used to match and switch the whole backstop off, leaving Redis +
    // BullMQ on a 400-user project — the reported bug, via the escape hatch.
    expect(
      needsAsyncProcessing('The API must rate-limit requests to prevent abuse.'),
    ).toBe(false);
    expect(
      needsAsyncProcessing('Schema changes ship as database migrations.'),
    ).toBe(false);
    // A third party's limit is still a genuine reason to queue.
    expect(
      needsAsyncProcessing(
        'The external shipping provider enforces a rate limit of 10 calls per minute.',
      ),
    ).toBe(true);
  });

  it('never removes a core layer, whatever technology it names', () => {
    // The match reaches through the technology string, so without a layer guard
    // an ordinary "NestJS + BullMQ" backend row or a Redis datastore is deleted
    // outright and the design ships with no backend / no database.
    const { techStack, removed } = enforceScaleAppropriateStack(
      [
        { layer: 'backend', technology: 'NestJS + BullMQ', rationale: 'Modular.' },
        { layer: 'database', technology: 'Redis', rationale: 'Primary datastore.' },
        { layer: 'cache', technology: 'Redis', rationale: 'Performance.' },
      ],
      'small',
      'Members receive a reminder before a task is due.',
    );

    expect(techStack.map((t) => t.layer)).toEqual(['backend', 'database']);
    expect(removed).toEqual(['Redis']); // only the dedicated cache row
  });
});

// ── 3. supporting tables ────────────────────────────────────────────────────

describe('unrequested supporting tables', () => {
  const auditLogs: Entity = {
    name: 'audit_logs',
    description: 'Record of every change.',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
      { name: 'actor_id', type: 'uuid', nullable: false },
      { name: 'action', type: 'string', nullable: false },
    ],
  };
  const tasks: Entity = {
    name: 'tasks',
    description: 'Work items.',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
      { name: 'title', type: 'string', nullable: false },
    ],
  };

  const design = (): DatabaseDesign => ({
    sessionId: 's1',
    generatedAt: new Date().toISOString(),
    databaseType: 'PostgreSQL',
    entities: [tasks, auditLogs],
    relations: [{ from: 'tasks', to: 'audit_logs', type: 'one-to-many' }],
  });

  it('does NOT treat "we have roles and permissions" as an audit requirement', () => {
    // The old prompt rule fired on exactly this, which is why every project got
    // an audit log: every application with roles restricts who may change records.
    const doc = requirements({
      functional: [
        {
          id: 'FR-1',
          title: 'Manage tasks',
          description: 'Only a team admin can delete a task.',
          priority: 'must',
        },
      ],
      roles: [
        { name: 'Admin', description: 'Team owner', permissions: ['delete tasks'] },
        { name: 'Member', description: 'Team member', permissions: ['create tasks'] },
      ],
    });

    expect(requiresAuditLog(doc)).toBe(false);

    const { design: next, removed } = stripUnrequestedSupportTables(design(), doc);
    expect(removed).toEqual(['audit_logs']);
    expect(next.entities.map((e) => e.name)).toEqual(['tasks']);
    // The relation goes with it — a dangling one produces DDL that fails at
    // ALTER TABLE, a long way from where the table was dropped.
    expect(next.relations).toEqual([]);
  });

  it('keeps the audit log when the requirements actually ask for one', () => {
    const explicit = requirements({
      nonFunctional: [
        {
          id: 'NFR-1',
          category: 'security',
          description: 'The system maintains an audit trail of who changed each record.',
        },
      ],
    });
    expect(requiresAuditLog(explicit)).toBe(true);
    expect(stripUnrequestedSupportTables(design(), explicit).removed).toEqual([]);

    // …and on a regulated data category, even with the word "audit" absent.
    const regulated = requirements({
      functional: [
        {
          id: 'FR-1',
          title: 'Patient records',
          description: 'Clinicians view and update the patient record for a visit.',
          priority: 'must',
        },
      ],
    });
    expect(requiresAuditLog(regulated)).toBe(true);
  });

  it('never strips a domain table that merely contains the word "log"', () => {
    const workoutLogs: Entity = {
      name: 'workout_logs',
      description: 'A member\'s recorded workouts — the product itself.',
      columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
    };
    const fitness: DatabaseDesign = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      databaseType: 'PostgreSQL',
      entities: [workoutLogs],
      relations: [],
    };

    const { removed } = stripUnrequestedSupportTables(fitness, requirements({}));
    expect(removed).toEqual([]);
  });
});

// ── 4. API query surface ────────────────────────────────────────────────────

describe('list endpoint query surface', () => {
  const comments: Entity = {
    name: 'comments',
    description: 'Comments on a task.',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
      { name: 'body', type: 'text', nullable: false },
      { name: 'created_at', type: 'timestamp', nullable: false },
      {
        name: 'task_id',
        type: 'uuid',
        nullable: false,
        references: { entity: 'tasks', column: 'id' },
      },
      {
        name: 'author_id',
        type: 'uuid',
        nullable: false,
        references: { entity: 'users', column: 'id' },
      },
    ],
  };

  const taskBoardRequirements =
    'Members can search and filter tasks by assignee and status. ' +
    'Members can comment on a task.';

  it('gives a small-tier resource nobody asked to search only pagination + FKs', () => {
    const demand = queryDemandFor(comments, {
      tier: 'small',
      requirementText: taskBoardRequirements,
    });
    expect(demand.search).toBe(false);
    expect(demand.dateRange).toBe(false);

    const params = listQueryParams(comments, demand).map((p) => p.name);
    expect(params).toEqual(['page', 'limit', 'task_id', 'author_id']);
    expect(params).not.toContain('search');
    expect(params).not.toContain('created_from');
  });

  it('still gives search to the resource the requirements DO describe searching', () => {
    const tasks: Entity = {
      name: 'tasks',
      description: 'Work items.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'title', type: 'string', nullable: false },
        { name: 'status', type: 'enum', nullable: false },
      ],
    };

    const demand = queryDemandFor(tasks, {
      tier: 'small',
      requirementText: taskBoardRequirements,
    });
    const params = listQueryParams(tasks, demand).map((p) => p.name);

    expect(params).toContain('search');
    // A resource with states exists to be filtered by them — structural, never gated.
    expect(params).toContain('status');
  });

  it('keeps the full query surface at the large tier', () => {
    const demand = queryDemandFor(comments, {
      tier: 'large',
      requirementText: taskBoardRequirements,
    });
    const params = listQueryParams(comments, demand).map((p) => p.name);

    expect(params).toContain('search');
    expect(params).toContain('created_from');
    expect(params).toContain('created_to');
  });

  it('defaults to the previous behaviour when no scope is supplied', () => {
    // A design generated before the tier existed carries none, and must render
    // exactly as it always did — the "an unstamped artifact is never stale" rule.
    const before = listQueryParams(comments).map((p) => p.name);
    expect(before).toContain('search');
    expect(before).toContain('created_from');
  });

  it('matches -es and -ies plurals when reading requirement sentences', () => {
    // `addresses` used to stem to `addresse`, a token in no sentence, so demand
    // detection failed closed for every entity with that plural form.
    const addresses: Entity = {
      name: 'addresses',
      description: 'Delivery addresses.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'line1', type: 'string', nullable: false },
      ],
    };

    const demand = queryDemandFor(addresses, {
      tier: 'small',
      requirementText: 'An operator can search an address by postcode.',
    });

    expect(demand.search).toBe(true);
  });

  it('trims a model-authored list endpoint back to the requested surface', () => {
    // The reported over-broad design came from the LLM path, which had only the
    // prompt behind it while the tech stack got prompt AND a code backstop.
    const db: DatabaseDesign = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      databaseType: 'PostgreSQL',
      entities: [comments],
      relations: [],
    };
    const modelDesign = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      modules: [
        {
          name: 'Comments',
          basePath: '/api/comments',
          coveredEntities: ['comments'],
          endpoints: [
            {
              method: 'GET' as const,
              path: '/api/comments',
              summary: 'List comments.',
              requestSchema: [
                { name: 'page', type: 'integer', required: false },
                { name: 'limit', type: 'integer', required: false },
                { name: 'search', type: 'string', required: false },
                { name: 'created_from', type: 'string', required: false },
                { name: 'created_to', type: 'string', required: false },
                { name: 'task_id', type: 'uuid', required: false },
                { name: 'author_id', type: 'uuid', required: false },
              ],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    };

    const { design, trimmed } = enforceQuerySurface(modelDesign, db, {
      tier: 'small',
      requirementText: taskBoardRequirements,
    });
    const params = design.modules[0].endpoints[0].requestSchema.map((p) => p.name);

    // Pagination and the FK filters within the tier's cap survive; the
    // unrequested search and date range do not.
    expect(params).toEqual(['page', 'limit', 'task_id', 'author_id']);
    expect(trimmed).toHaveLength(3);
  });

  it('leaves a model-authored design alone above the small tier', () => {
    const db: DatabaseDesign = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      databaseType: 'PostgreSQL',
      entities: [comments],
      relations: [],
    };
    const design = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      modules: [
        {
          name: 'Comments',
          basePath: '/api/comments',
          coveredEntities: ['comments'],
          endpoints: [
            {
              method: 'GET' as const,
              path: '/api/comments',
              summary: 'List comments.',
              requestSchema: [{ name: 'search', type: 'string', required: false }],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    };

    const { trimmed } = enforceQuerySurface(design, db, {
      tier: 'large',
      requirementText: taskBoardRequirements,
    });
    expect(trimmed).toEqual([]);
  });

  it('threads the scope through the whole deterministic REST build', () => {
    const db: DatabaseDesign = {
      sessionId: 's1',
      generatedAt: new Date().toISOString(),
      databaseType: 'PostgreSQL',
      entities: [comments],
      relations: [],
    };

    const { modules } = buildRestApi(db, {
      queryScope: { tier: 'small', requirementText: taskBoardRequirements },
    });
    const list = modules[0].endpoints.find(
      (e) => e.method === 'GET' && !e.path.includes(':'),
    )!;

    expect(list.requestSchema.map((p) => p.name)).not.toContain('search');
  });
});
