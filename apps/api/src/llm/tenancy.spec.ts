import {
  enforceTenancy,
  requiresMultiTenancy,
  type DatabaseDesign,
  type Entity,
  type RequirementDocument,
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
