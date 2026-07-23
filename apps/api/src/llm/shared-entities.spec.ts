import {
  applyTenancy,
  ensureTenancy,
  findSharedEntityDeclarations,
  isSharedEntity,
  reconcileSharedEntities,
  sharedEntityDirective,
  REFERENCE_ONLY_PREFIX,
  type DatabaseDesign,
  type Entity,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';

/**
 * Cross-tenant SHARED records.
 *
 * The reported bug: a clinic group's confirmed business rule said patient
 * records are shared across all clinics and are NOT branch-scoped, and the
 * generated schema gave `patients` a mandatory `branch_id` plus a "each branch
 * has many patients" relationship — splitting into N records the one thing the
 * client had explicitly asked to keep unified, and dragging bills, payments and
 * claims along with it. Regenerating did not help.
 *
 * Two independent causes, and this file pins both fixed:
 *  1. the business rules were never printed into the schema prompt at all, so
 *     the sentence never reached the model on any run; and
 *  2. `ensureTenancy` put the mandatory FK back afterwards regardless of what
 *     the model produced.
 *
 * The point of the fix is that **nothing is keyed on an entity name**. The
 * "generality" block below runs a retail chain whose shared record is called
 * `members`, with no code path that knows that word — if it only passes for
 * `patients`, the fix is a patch and not a rule.
 */

const requirements = (over: Partial<RequirementDocument> = {}): RequirementDocument => ({
  sessionId: 's1',
  generatedAt: '2026-07-23T00:00:00.000Z',
  functional: [],
  nonFunctional: [],
  roles: [],
  businessRules: [],
  constraints: [],
  assumptions: [],
  ...over,
});

const col = (name: string, refEntity?: string, over: Record<string, unknown> = {}) => ({
  name,
  type: 'uuid',
  nullable: false,
  ...(refEntity ? { references: { entity: refEntity, column: 'id' } } : {}),
  ...over,
});

const entity = (name: string, columns: Entity['columns']): Entity => ({
  name,
  description: '',
  columns,
});

const design = (entities: Entity[], relations: DatabaseDesign['relations'] = []): DatabaseDesign => ({
  sessionId: 's1',
  generatedAt: '2026-07-23T00:00:00.000Z',
  databaseType: 'PostgreSQL',
  entities,
  relations,
});

const columnNames = (d: DatabaseDesign, table: string) =>
  d.entities.find((e) => e.name === table)?.columns.map((c) => c.name) ?? [];

const column = (d: DatabaseDesign, table: string, name: string) =>
  d.entities.find((e) => e.name === table)?.columns.find((c) => c.name === name);

// ── the reported project: MedCore Health Group ──────────────────────────────

/** Multi-branch (so tenancy is required) with the shared-patient rule stated. */
const medcoreRequirements = (): RequirementDocument =>
  requirements({
    executiveSummary:
      'A practice management platform for MedCore Health Group, operating multiple clinics across the region.',
    functional: [
      {
        id: 'FR-1',
        title: 'Branch provisioning',
        description: 'Super Admins create new clinic branches and configure branch settings.',
        priority: 'must',
      },
      {
        id: 'FR-2',
        title: 'Appointments',
        description: 'Front desk staff book appointments for patients at their clinic.',
        priority: 'must',
      },
    ],
    roles: [
      { name: 'Branch Manager', description: 'Administrator for a single clinic branch.', permissions: [] },
    ],
    businessRules: [
      {
        id: 'BR-1',
        description:
          'Patient records are shared across all clinics and are not branch-scoped. A patient registered at one clinic can be treated at any other clinic in the group.',
      },
      {
        id: 'BR-2',
        description: 'An appointment always belongs to the clinic where it takes place.',
      },
    ],
  });

const medcoreSystemDesign = (): SystemDesign =>
  ({
    services: [
      { name: 'BranchService', responsibility: 'Provisions new tenants and branch settings.', dependencies: [] },
    ],
  }) as unknown as SystemDesign;

describe('MedCore — the reported bug', () => {
  it('reads the shared-patient business rule as a declaration', () => {
    const declarations = findSharedEntityDeclarations(medcoreRequirements());
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations[0].source).toBe('business-rule');
    expect(isSharedEntity('patients', declarations)).toBe(true);
  });

  /**
   * Cause 2. The schema the model produced was already correct here — no
   * `branch_id` on patients — and the backstop was what broke it.
   */
  it('ensureTenancy no longer forces a mandatory branch_id onto patients', () => {
    const input = design([
      entity('users', [col('id'), col('email')]),
      entity('patients', [col('id'), col('full_name')]),
      entity('appointments', [col('id'), col('patient_id', 'patients')]),
      entity('bills', [col('id'), col('patient_id', 'patients')]),
    ]);

    const { design: out } = ensureTenancy(input, medcoreRequirements(), medcoreSystemDesign());

    expect(columnNames(out, 'patients')).not.toContain('branch_id');
    // The carve-out is the shared record ONLY: a visit and a bill happen at one
    // clinic and must stay scoped, or the fix would trade one bug for a leak.
    expect(columnNames(out, 'appointments')).toContain('branch_id');
    expect(columnNames(out, 'bills')).toContain('branch_id');
    expect(columnNames(out, 'users')).toContain('branch_id');
  });

  it('no branch → patients ownership relation is invented', () => {
    const { design: out } = ensureTenancy(
      design([entity('patients', [col('id')])]),
      medcoreRequirements(),
      medcoreSystemDesign(),
    );
    expect(
      out.relations.filter((r) => r.from === 'branches' && r.to === 'patients'),
    ).toHaveLength(0);
  });

  /** Cause 2, the other half: the model emitted the bad schema and we fix it. */
  it('demotes a mandatory branch_id the model emitted, and drops the has-many', () => {
    const bad = design(
      [
        entity('branches', [col('id'), col('name')]),
        entity('patients', [
          col('id'),
          col('branch_id', 'branches'),
          col('national_id', undefined, { unique: true }),
        ]),
        entity('bills', [col('id'), col('branch_id', 'branches'), col('patient_id', 'patients')]),
      ],
      [
        { from: 'branches', to: 'patients', type: 'one-to-many', description: 'A branch has many patients.' },
        { from: 'branches', to: 'bills', type: 'one-to-many' },
        { from: 'patients', to: 'bills', type: 'one-to-many' },
      ],
    );

    const { design: out, notices } = reconcileSharedEntities(
      bad,
      findSharedEntityDeclarations(medcoreRequirements()),
      { table: 'branches', column: 'branch_id' },
    );

    // Demoted, not deleted: the originating clinic is a fact worth keeping, it
    // just cannot be ownership any more.
    expect(columnNames(out, 'patients')).not.toContain('branch_id');
    const demoted = column(out, 'patients', `${REFERENCE_ONLY_PREFIX}branch_id`);
    expect(demoted).toBeDefined();
    expect(demoted?.nullable).toBe(true);
    expect(demoted?.unique).toBe(false);
    expect(demoted?.references).toEqual({ entity: 'branches', column: 'id' });

    // The ownership claim is also carried by the relation, so it goes too.
    expect(out.relations.some((r) => r.from === 'branches' && r.to === 'patients')).toBe(false);
    // Dependents keep both their branch scope and their link to the patient —
    // which is what makes the cross-branch history whole again.
    expect(out.relations.some((r) => r.from === 'branches' && r.to === 'bills')).toBe(true);
    expect(columnNames(out, 'bills')).toContain('branch_id');
    expect(columnNames(out, 'bills')).toContain('patient_id');

    // The correction is never silent, and it quotes the rule that caused it.
    expect(notices.join(' ')).toContain('patients');
    expect(notices.join(' ')).toContain('not branch-scoped');
  });

  /**
   * The acceptance criterion that matters most: the bug recurred on Regenerate.
   * Running the whole reconciliation twice must be a fixed point.
   */
  it('is stable across regeneration — a second pass changes nothing', () => {
    const bad = design(
      [
        entity('branches', [col('id')]),
        entity('patients', [col('id'), col('branch_id', 'branches')]),
      ],
      [{ from: 'branches', to: 'patients', type: 'one-to-many' }],
    );
    const reqs = medcoreRequirements();
    const sys = medcoreSystemDesign();

    const first = applyTenancy(bad, reqs, sys).design;
    const second = applyTenancy(first, reqs, sys).design;

    expect(second).toEqual(first);
    expect(columnNames(second, 'patients')).not.toContain('branch_id');
    expect(columnNames(second, 'patients')).toContain(`${REFERENCE_ONLY_PREFIX}branch_id`);
    // And the demotion is not re-applied to itself into registered_at_registered_at_…
    expect(
      columnNames(second, 'patients').filter((c) => c.includes(REFERENCE_ONLY_PREFIX)),
    ).toHaveLength(1);
  });

  it('puts the rule in the prompt as a hard constraint that overrides tenancy', () => {
    const directive = sharedEntityDirective(
      findSharedEntityDeclarations(medcoreRequirements()),
      { table: 'branches', column: 'branch_id' },
    );
    expect(directive).toContain('HARD CONSTRAINT');
    expect(directive).toContain('OVERRIDES');
    expect(directive).toContain('not branch-scoped');
    expect(directive).toContain(`${REFERENCE_ONLY_PREFIX}branch_id`);
    // The carve-out has to be stated, or "stop scoping this" reads as licence to
    // stop scoping the tables around it.
    expect(directive).toMatch(/appointment|transaction/i);
  });
});

// ── generality: the same rule, an entity nothing in the code knows ──────────

/**
 * A multi-location gym chain whose shared record is `members`. No regex, table
 * or constant anywhere in the fix mentions members, gyms or retail — if this
 * passes, the rule is general.
 */
const gymRequirements = (): RequirementDocument =>
  requirements({
    executiveSummary: 'Membership management for a fitness chain with multiple locations.',
    functional: [
      {
        id: 'FR-1',
        title: 'Location management',
        description: 'Head office can provision new locations and configure each location.',
        priority: 'must',
      },
    ],
    roles: [{ name: 'Location Manager', description: 'Runs a single location.', permissions: [] }],
    businessRules: [
      {
        id: 'BR-1',
        description:
          'A membership is shared across all locations — members can check in at any location and hold one unified record.',
      },
      { id: 'BR-2', description: 'A check-in is recorded against the location where it happened.' },
    ],
  });

describe('generality — a differently-named shared entity', () => {
  it('exempts "members" with no entity name hardcoded anywhere', () => {
    const declarations = findSharedEntityDeclarations(gymRequirements());
    expect(isSharedEntity('members', declarations)).toBe(true);
    // And it is genuinely selective, not "everything is shared".
    expect(isSharedEntity('check_ins', declarations)).toBe(false);
    expect(isSharedEntity('payments', declarations)).toBe(false);
    expect(isSharedEntity('staff', declarations)).toBe(false);
  });

  it('produces a correct schema end-to-end', () => {
    const bad = design(
      [
        entity('locations', [col('id'), col('name')]),
        entity('members', [col('id'), col('location_id', 'locations'), col('email')]),
        entity('check_ins', [col('id'), col('location_id', 'locations'), col('member_id', 'members')]),
        entity('payments', [col('id'), col('location_id', 'locations'), col('member_id', 'members')]),
      ],
      [
        { from: 'locations', to: 'members', type: 'one-to-many', description: 'A location has many members.' },
        { from: 'locations', to: 'check_ins', type: 'one-to-many' },
      ],
    );

    const { design: out, sharedEntityNotices } = applyTenancy(bad, gymRequirements());

    expect(columnNames(out, 'members')).not.toContain('location_id');
    expect(column(out, 'members', `${REFERENCE_ONLY_PREFIX}location_id`)?.nullable).toBe(true);
    expect(out.relations.some((r) => r.from === 'locations' && r.to === 'members')).toBe(false);

    // A check-in and a payment happen somewhere. They stay scoped.
    expect(columnNames(out, 'check_ins')).toContain('location_id');
    expect(columnNames(out, 'payments')).toContain('location_id');
    expect(out.relations.some((r) => r.from === 'locations' && r.to === 'check_ins')).toBe(true);

    expect(sharedEntityNotices.join(' ')).toContain('members');
  });

  it.each([
    ['customers', 'Customer accounts are shared across all store locations.'],
    ['students', 'A student record is unified across every campus and is not campus-specific.'],
    ['residents', 'Resident files must not be tied to a single facility.'],
    ['guests', 'Guest profiles are accessible from any hotel in the group.'],
    ['clients', "A client's case history is shared between all offices."],
  ])('generalizes to %s', (table, rule) => {
    const declarations = findSharedEntityDeclarations(
      requirements({ businessRules: [{ id: 'BR-1', description: rule }] }),
    );
    expect(isSharedEntity(table, declarations)).toBe(true);
  });
});

// ── the conservative half: silence changes nothing ─────────────────────────

/**
 * Removing tenant scoping is the dangerous direction — it is the cross-tenant
 * leak the tenancy module exists to prevent — so the exception must fire only on
 * an explicit written statement, never on an inference from a table's name or
 * from a sentence that merely mentions it.
 */
describe('conservatism — no statement, no exception', () => {
  it('a multi-branch project with no shared rule scopes everything, as before', () => {
    const reqs = requirements({
      executiveSummary: 'A platform serving multiple clinics.',
      businessRules: [{ id: 'BR-1', description: 'Patients must provide a national ID at registration.' }],
    });

    const { design: out } = ensureTenancy(
      design([entity('patients', [col('id')]), entity('visits', [col('id')])]),
      reqs,
    );

    expect(columnNames(out, 'patients')).toContain('clinic_id');
    expect(columnNames(out, 'visits')).toContain('clinic_id');
  });

  it('does not read a sentence about something ELSE as a declaration', () => {
    // The subject is the portal, not the patient — the head-noun rule.
    const declarations = findSharedEntityDeclarations(
      requirements({
        businessRules: [
          { id: 'BR-1', description: 'The patient portal is accessible from any branch.' },
        ],
      }),
    );
    expect(isSharedEntity('patients', declarations)).toBe(false);
  });

  it('reads "X records" as a statement about X, not about a records table', () => {
    const declarations = findSharedEntityDeclarations(
      requirements({
        businessRules: [
          { id: 'BR-1', description: 'Customer records are shared across all branches.' },
        ],
      }),
    );
    expect(isSharedEntity('customers', declarations)).toBe(true);
    expect(isSharedEntity('customer_records', declarations)).toBe(true);
    expect(isSharedEntity('orders', declarations)).toBe(false);
  });

  /**
   * Both of these fired on MedCore's real executive summary during a live
   * regeneration, warning about a schema where nothing was wrong. A summary is
   * marketing prose about the product, thick with this module's vocabulary and
   * asserting nothing about record scope.
   */
  it.each([
    [
      'a summary promising work "across all clinics"',
      'MedCore Health Group will receive a single bilingual system that lets clinicians see patient records, schedule appointments and handle billing across all clinics.',
    ],
    [
      'a summary promising "a unified view"',
      'The solution works offline at the two clinics with unreliable internet and syncs when connectivity returns, giving the organization a unified view and reducing manual errors.',
    ],
  ])('does not read %s as a declaration', (_label, summary) => {
    expect(findSharedEntityDeclarations(requirements({ executiveSummary: summary }))).toEqual([]);
  });

  it('reads rules and constraints, not the executive summary', () => {
    const shared = 'Patient records are shared across all clinics.';
    expect(findSharedEntityDeclarations(requirements({ executiveSummary: shared }))).toEqual([]);
    expect(
      findSharedEntityDeclarations(requirements({ businessRules: [{ id: 'BR-1', description: shared }] })),
    ).toHaveLength(1);
    expect(findSharedEntityDeclarations(requirements({ constraints: [shared] }))).toHaveLength(1);
  });

  it('emits no directive and no notices when nothing was declared', () => {
    expect(sharedEntityDirective([], { table: 'branches', column: 'branch_id' })).toBe('');
    const { sharedEntityNotices } = applyTenancy(
      design([entity('patients', [col('id')])]),
      requirements({ executiveSummary: 'A platform serving multiple clinics.' }),
    );
    expect(sharedEntityNotices).toEqual([]);
  });

  it('is a no-op for a single-business project (no tenancy to be shared across)', () => {
    const { design: out, sharedEntityNotices } = applyTenancy(
      design([entity('customers', [col('id')])]),
      requirements({
        businessRules: [{ id: 'BR-1', description: 'Customer records are shared across all branches.' }],
      }),
    );
    expect(sharedEntityNotices).toEqual([]);
    expect(columnNames(out, 'customers')).toEqual(['id']);
  });

  /**
   * A rule we can read but cannot attribute to a table is reported, not dropped.
   * This is also the expected path for an Arabic document, whose subject is
   * deliberately not parsed — "we found this and could not place it" is
   * actionable; silence is not.
   */
  it('warns rather than guessing when a declaration matches no table', () => {
    const { sharedEntityNotices } = applyTenancy(
      design([
        entity('branches', [col('id')]),
        entity('invoices', [col('id'), col('branch_id', 'branches')]),
      ]),
      requirements({
        executiveSummary: 'A platform serving multiple clinics.',
        businessRules: [
          { id: 'BR-1', description: 'Loyalty balances are shared across all branches.' },
        ],
      }),
    );
    expect(sharedEntityNotices).toHaveLength(1);
    expect(sharedEntityNotices[0]).toContain('Loyalty balances');
  });

  it('detects the Arabic phrasing rather than silently switching off', () => {
    const declarations = findSharedEntityDeclarations(
      requirements({
        businessRules: [
          { id: 'BR-1', description: 'سجلات المرضى مشتركة بين جميع الفروع ولا ترتبط بفرع واحد.' },
        ],
      }),
    );
    expect(declarations).toHaveLength(1);
  });
});
