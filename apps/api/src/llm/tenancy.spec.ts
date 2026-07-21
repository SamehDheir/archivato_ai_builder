import {
  applyTenancy,
  enforceTenancy,
  ensureTenancy,
  requiresMultiTenancy,
  tenantEntityFor,
  type DatabaseDesign,
  type Entity,
  type RequirementDocument,
  type SystemDesign,
} from '@archivato/shared';

/**
 * The prompt's tenancy rule has to stay emphatic — a partial tenant scope is a
 * cross-tenant data leak — and an emphatic rule with no negative case reads to a
 * model as "tenancy is the professional default". A single-store fashion project
 * came back with a `tenants` table and a `tenant_id` on every table: a join on
 * every query and scoping on every endpoint, billed to a client who described
 * one shop.
 *
 * The asymmetry is the design. Stripping tenancy from a real multi-tenant schema
 * creates the leak; leaving it on a single-tenant one costs money. So any
 * plausible multi-org signal keeps it.
 */

const requirements = (over: Partial<RequirementDocument> = {}): RequirementDocument => ({
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  functional: [
    { id: 'FR-1', title: 'Browse catalog', description: 'Shoppers browse products.', priority: 'must' },
  ],
  nonFunctional: [],
  roles: [{ name: 'Admin', description: 'Runs the store', permissions: [] }],
  businessRules: [],
  constraints: [],
  assumptions: [],
  ...over,
});

const col = (name: string, refEntity?: string) => ({
  name,
  type: 'uuid',
  nullable: false,
  ...(refEntity ? { references: { entity: refEntity, column: 'id' } } : {}),
});

const entity = (name: string, columns: Entity['columns']): Entity => ({
  name,
  description: '',
  columns,
});

/** A schema where `tenants` scopes everything — what the model kept emitting. */
const tenantedShop = (): DatabaseDesign => ({
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  databaseType: 'PostgreSQL',
  entities: [
    entity('tenants', [col('id'), col('name')]),
    entity('products', [col('id'), col('tenant_id', 'tenants'), col('title')]),
    entity('orders', [col('id'), col('tenant_id', 'tenants'), col('total')]),
    entity('customers', [col('id'), col('tenant_id', 'tenants'), col('email')]),
  ],
  relations: [
    { from: 'tenants', to: 'products', type: 'one-to-many' },
    { from: 'customers', to: 'orders', type: 'one-to-many' },
  ],
});

describe('requiresMultiTenancy', () => {
  it('is false for a single business', () => {
    expect(requiresMultiTenancy(requirements())).toBe(false);
  });

  it.each([
    'The platform serves multiple clinics across the region.',
    'A multi-tenant SaaS for retail chains.',
    'Each organization manages its own staff.',
    'White-label deployment per customer.',
    'Multi-branch hospital operations.',
  ])('is true when the requirements say %p', (summary) => {
    expect(requiresMultiTenancy(requirements({ executiveSummary: summary }))).toBe(true);
  });

  /** A plural noun is not tenancy — the distinction the regex has to hold. */
  it.each([
    'The store sells multiple products to multiple customers.',
    'Staff can manage multiple orders at once.',
  ])('is false for the merely-plural %p', (summary) => {
    expect(requiresMultiTenancy(requirements({ executiveSummary: summary }))).toBe(false);
  });

  it('reads a role named for an org boundary as a signal', () => {
    const reqs = requirements({
      roles: [
        { name: 'Branch Manager', description: 'Manages each branch', permissions: [] },
      ],
    });
    expect(requiresMultiTenancy(reqs)).toBe(true);
  });
});

describe('enforceTenancy', () => {
  it('strips the tenant table and its scoping keys from a single-business schema', () => {
    const { design, removed } = enforceTenancy(tenantedShop(), requirements());

    expect(design.entities.map((e) => e.name)).toEqual([
      'products',
      'orders',
      'customers',
    ]);
    expect(
      design.entities.flatMap((e) => e.columns.map((c) => c.name)),
    ).not.toContain('tenant_id');
    // Relations touching the removed table go with it; the rest survive.
    expect(design.relations).toEqual([
      { from: 'customers', to: 'orders', type: 'one-to-many' },
    ]);
    expect(removed).toContain('tenants');
  });

  it('leaves a genuinely multi-tenant schema completely alone', () => {
    const input = tenantedShop();
    const reqs = requirements({
      executiveSummary: 'A multi-tenant platform serving multiple stores.',
    });

    const { design, removed } = enforceTenancy(input, reqs);

    expect(design).toBe(input); // same reference — untouched
    expect(removed).toBeNull();
  });

  it('is a no-op on a schema that never had tenancy', () => {
    const plain: DatabaseDesign = {
      ...tenantedShop(),
      entities: [
        entity('products', [col('id'), col('title')]),
        entity('orders', [col('id'), col('customer_id', 'customers')]),
      ],
      relations: [],
    };

    expect(enforceTenancy(plain, requirements()).removed).toBeNull();
  });

  /**
   * The safeguard that stops this mangling a real schema: a table whose name
   * happens to match, but which only a minority of tables reference, is a domain
   * record and not a tenant scope.
   */
  it('keeps a tenant-NAMED table that is really a domain entity', () => {
    const design: DatabaseDesign = {
      ...tenantedShop(),
      entities: [
        entity('stores', [col('id'), col('address')]),
        entity('products', [col('id'), col('title')]),
        entity('orders', [col('id'), col('store_id', 'stores')]),
        entity('customers', [col('id'), col('email')]),
      ],
      relations: [],
    };

    const { design: next, removed } = enforceTenancy(design, requirements());

    expect(next.entities.map((e) => e.name)).toContain('stores');
    expect(removed).toBeNull();
  });

  it('keeps an FK that points at a surviving table', () => {
    const { design } = enforceTenancy(tenantedShop(), requirements());
    const orders = design.entities.find((e) => e.name === 'orders');
    expect(orders?.columns.map((c) => c.name)).toEqual(['id', 'total']);
  });
});

// ── Bug S: signals the original regex missed, and the positive backstop ──────

/** The enterprise HealthTech run that shipped a single-tenant schema. */
const healthTechRequirements = (): RequirementDocument =>
  requirements({
    functional: [
      {
        id: 'FR-1',
        title: 'Tenant provisioning',
        description:
          'Super Admins can create new clinic or hospital branches and configure tenant settings.',
        priority: 'must',
      },
      { id: 'FR-2', title: 'Book appointment', description: 'Patients book visits.', priority: 'must' },
    ],
    roles: [
      { name: 'Super Admin', description: 'Operates across all branches.', permissions: [] },
      {
        name: 'Branch Manager',
        description: 'Local administrator for a single clinic or hospital branch.',
        permissions: [],
      },
    ],
  });

const tenantService = (): SystemDesign =>
  ({
    services: [
      {
        name: 'TenantService',
        responsibility:
          'Provisions new tenants, enforces data-residency routing per region.',
        dependencies: [],
      },
    ],
  }) as unknown as SystemDesign;

describe('requiresMultiTenancy — signals the original regex missed', () => {
  it('reads a tenant-provisioning requirement as a signal', () => {
    expect(requiresMultiTenancy(healthTechRequirements())).toBe(true);
  });

  it('reads a role scoped to "a single branch" as a signal', () => {
    const reqs = requirements({
      roles: [
        { name: 'Manager', description: 'Runs a single clinic branch.', permissions: [] },
      ],
    });
    expect(requiresMultiTenancy(reqs)).toBe(true);
  });

  it('reads a Tenant/provisioning service in the system design as a signal', () => {
    // Requirements alone are neutral here; the service responsibility carries it.
    const neutral = requirements({
      functional: [
        { id: 'FR-1', title: 'Manage records', description: 'Staff manage records.', priority: 'must' },
      ],
      roles: [{ name: 'Staff', description: 'Handles records.', permissions: [] }],
    });
    expect(requiresMultiTenancy(neutral)).toBe(false);
    expect(requiresMultiTenancy(neutral, tenantService())).toBe(true);
  });

  it.each([
    ['a multi-school platform', 'Each school manages its own students and staff.'],
    ['a multi-warehouse platform', 'Inventory is scoped per warehouse across multiple warehouses.'],
    ['a franchise chain', 'A franchise chain of coffee shops, each franchise self-managed.'],
  ])('generalizes to %s', (_label, summary) => {
    expect(requiresMultiTenancy(requirements({ executiveSummary: summary }))).toBe(true);
  });

  it('still does not fire on a single business with plural nouns', () => {
    const reqs = requirements({
      executiveSummary: 'One boutique selling many products to many customers.',
      roles: [{ name: 'Store Manager', description: 'Runs the shop.', permissions: [] }],
    });
    expect(requiresMultiTenancy(reqs)).toBe(false);
  });
});

describe('tenantEntityFor', () => {
  it('names the tenant table after the domain vocabulary', () => {
    expect(tenantEntityFor(healthTechRequirements()).table).toBe('branches');
    expect(
      tenantEntityFor(requirements({ executiveSummary: 'Multiple schools.' })).column,
    ).toBe('school_id');
    expect(
      tenantEntityFor(requirements({ executiveSummary: 'Per warehouse scoping across warehouses.' })).table,
    ).toBe('warehouses');
  });

  it('falls back to tenants/tenant_id with no specific noun', () => {
    // A haystack with no org noun at all (the default helper's "runs the store"
    // role would otherwise supply "stores").
    const noNoun = requirements({
      executiveSummary: 'A multi-tenant SaaS.',
      functional: [
        { id: 'FR-1', title: 'Manage data', description: 'Users manage their data.', priority: 'must' },
      ],
      roles: [{ name: 'Admin', description: 'Runs the system.', permissions: [] }],
    });
    expect(tenantEntityFor(noNoun)).toEqual({ table: 'tenants', column: 'tenant_id' });
  });
});

describe('ensureTenancy — adds the scoping the model dropped', () => {
  /** The bug: a multi-tenant project whose schema has NO tenancy at all. */
  const singleTenantSchema = (): DatabaseDesign => ({
    sessionId: 's1',
    generatedAt: '2026-07-20T00:00:00.000Z',
    databaseType: 'PostgreSQL',
    entities: [
      entity('users', [col('id'), { name: 'email', type: 'string', nullable: false }]),
      entity('patients', [col('id'), { name: 'name', type: 'string', nullable: false }]),
      entity('appointments', [col('id'), col('patient_id', 'patients')]),
      // A pure junction — must be left unscoped (scoped through its parents).
      entity('patient_tags', [col('id'), col('patient_id', 'patients'), col('tag_id', 'tags')]),
    ],
    relations: [{ from: 'patients', to: 'appointments', type: 'one-to-many' }],
  });

  it('adds the tenant table + scoping FK to every domain table', () => {
    const { design, added } = ensureTenancy(
      singleTenantSchema(),
      healthTechRequirements(),
      tenantService(),
    );

    expect(added).toBeTruthy();
    expect(design.entities[0].name).toBe('branches'); // tenant table leads
    const scoped = (name: string) =>
      design.entities.find((e) => e.name === name)?.columns.map((c) => c.name);
    expect(scoped('users')).toContain('branch_id');
    expect(scoped('patients')).toContain('branch_id');
    expect(scoped('appointments')).toContain('branch_id');
    // The pure junction is scoped through its parents, not directly.
    expect(scoped('patient_tags')).not.toContain('branch_id');
  });

  it('trusts a schema that already models tenancy (no double-add)', () => {
    const input = tenantedShop();
    const { design, added } = ensureTenancy(
      input,
      requirements({ executiveSummary: 'A multi-tenant SaaS for retail chains.' }),
    );
    expect(added).toBeNull();
    expect(design).toBe(input); // untouched — same reference
    expect(design.entities.filter((e) => e.name === 'tenants')).toHaveLength(1);
  });

  it('does nothing when the project is single-tenant', () => {
    const { design, added } = ensureTenancy(singleTenantSchema(), requirements());
    expect(added).toBeNull();
    expect(design.entities.some((e) => e.name === 'branches')).toBe(false);
  });
});

describe('applyTenancy — one entry point, both directions', () => {
  it('adds when required and missing', () => {
    const schema: DatabaseDesign = {
      sessionId: 's1',
      generatedAt: '2026-07-20T00:00:00.000Z',
      databaseType: 'PostgreSQL',
      entities: [entity('users', [col('id')])],
      relations: [],
    };
    const { added, removed } = applyTenancy(schema, healthTechRequirements(), tenantService());
    expect(added).toBeTruthy();
    expect(removed).toBeNull();
  });

  it('strips when present and unrequested', () => {
    const { added, removed } = applyTenancy(tenantedShop(), requirements());
    expect(removed).toBeTruthy();
    expect(added).toBeNull();
  });
});
