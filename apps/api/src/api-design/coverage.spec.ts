import {
  buildRestApi,
  ensureEntityCoverage,
  inferCoveredEntities,
  isJunctionEntity,
  mergeMissingCoverage,
  validateEntityCoverage,
  withResolvedCoverage,
  type ApiDesign,
  type ApiModule,
  type DatabaseDesign,
} from '@archivato/shared';

function module(over: Partial<ApiModule> = {}): ApiModule {
  return {
    name: 'Orders',
    basePath: '/api/orders',
    endpoints: [
      {
        method: 'GET',
        path: '/api/orders',
        summary: 'List orders.',
        requestSchema: [],
        responseSchema: [],
        statusCodes: [200],
      },
    ],
    ...over,
  };
}

function design(over: Partial<ApiDesign> = {}): ApiDesign {
  return {
    sessionId: 's1',
    generatedAt: new Date().toISOString(),
    modules: [module()],
    ...over,
  };
}

/** A small but realistic shape: parent, child, a pure join table, a rich join. */
const DB: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: new Date().toISOString(),
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'customers',
      description: 'People who order.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, unique: true },
      ],
    },
    {
      name: 'orders',
      description: 'A purchase.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'customer_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'customers', column: 'id' },
        },
        { name: 'total', type: 'decimal', nullable: false },
      ],
    },
    {
      name: 'products',
      description: 'Things for sale.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
      ],
    },
    {
      // Pure join table: keys and a timestamp, nothing of its own.
      name: 'order_products',
      description: 'Links orders to products.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'order_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'orders', column: 'id' },
        },
        {
          name: 'product_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'products', column: 'id' },
        },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
    },
    {
      // Two FKs but real data of its own — a resource, not a link.
      name: 'reviews',
      description: 'A product review by a customer.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        {
          name: 'product_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'products', column: 'id' },
        },
        {
          name: 'customer_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'customers', column: 'id' },
        },
        { name: 'rating', type: 'integer', nullable: false },
      ],
    },
  ],
  relations: [
    { from: 'orders', to: 'customers', type: 'one-to-many' },
    { from: 'orders', to: 'products', type: 'many-to-many' },
  ],
};

const NAMES = DB.entities.map((e) => e.name);

describe('validateEntityCoverage', () => {
  it('passes when every entity is covered by a group', () => {
    const result = validateEntityCoverage(
      design({
        modules: [
          module({ coveredEntities: ['orders', 'customers'] }),
          module({ name: 'Products', coveredEntities: ['products'] }),
        ],
      }),
      ['orders', 'customers', 'products'],
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(['orders', 'customers', 'products']);
  });

  it('fails when an entity has no group and no exclusion', () => {
    const result = validateEntityCoverage(
      design({ modules: [module({ coveredEntities: ['orders'] })] }),
      ['orders', 'invoices'],
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['invoices']);
  });

  it('passes when an uncovered entity is excluded with a reason', () => {
    const result = validateEntityCoverage(
      design({
        modules: [module({ coveredEntities: ['orders'] })],
        excludedEntities: [
          {
            entity: 'order_products',
            reason: 'Join table managed through the Orders resource.',
          },
        ],
      }),
      ['orders', 'order_products'],
    );
    expect(result.ok).toBe(true);
    expect(result.excluded).toEqual(['order_products']);
  });

  it('rejects an exclusion with no reason — a bare name justifies nothing', () => {
    const result = validateEntityCoverage(
      design({ modules: [module({ coveredEntities: ['orders'] })] }),
      ['orders', 'audit_log'],
    );
    expect(result.missing).toEqual(['audit_log']);

    const blank = validateEntityCoverage(
      design({
        modules: [module({ coveredEntities: ['orders'] })],
        excludedEntities: [{ entity: 'audit_log', reason: '   ' }],
      }),
      ['orders', 'audit_log'],
    );
    expect(blank.missing).toEqual(['audit_log']);
  });

  it('ignores a claim on an entity that does not exist', () => {
    const result = validateEntityCoverage(
      design({ modules: [module({ coveredEntities: ['orders', 'ghosts'] })] }),
      ['orders'],
    );
    expect(result.covered).toEqual(['orders']);
    expect(result.ok).toBe(true);
  });

  it('counts an entity that is both covered and excluded as covered', () => {
    const result = validateEntityCoverage(
      design({
        modules: [module({ coveredEntities: ['orders'] })],
        excludedEntities: [{ entity: 'orders', reason: 'nested' }],
      }),
      ['orders'],
    );
    expect(result.covered).toEqual(['orders']);
    expect(result.excluded).toEqual([]);
  });

  it('treats a design with no coverage claims as covering nothing', () => {
    // The pre-coverage artifact shape: real modules, no bookkeeping. The
    // validator reports it honestly; `withResolvedCoverage` is what reads paths.
    const result = validateEntityCoverage(design(), ['orders']);
    expect(result.missing).toEqual(['orders']);
  });
});

describe('inferCoveredEntities', () => {
  it('reads entities out of the module and endpoint paths', () => {
    expect(inferCoveredEntities(module(), NAMES)).toEqual(['orders']);
  });

  it('matches a singular path against a plural table', () => {
    expect(
      inferCoveredEntities(
        module({ basePath: '/api/product', endpoints: [] }),
        NAMES,
      ),
    ).toEqual(['products']);
  });

  it('matches across separator styles (order-products ↔ order_products)', () => {
    expect(
      inferCoveredEntities(
        module({ basePath: '/api/order-products', endpoints: [] }),
        NAMES,
      ),
    ).toEqual(['order_products']);
  });

  it('never reads a path param or the api prefix as a resource', () => {
    expect(
      inferCoveredEntities(
        module({
          basePath: '/api/auth',
          endpoints: [
            {
              method: 'POST',
              path: '/api/auth/login',
              summary: '',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        }),
        NAMES,
      ),
    ).toEqual([]);
  });

  it('does not credit a parent with a child it merely links to', () => {
    // A nested read route is not the orders API. Counting it as coverage would
    // suppress the repair that should build the real resource.
    expect(
      inferCoveredEntities(
        module({
          basePath: '/api/customers',
          endpoints: [
            {
              method: 'GET',
              path: '/api/customers/:id/orders',
              summary: '',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        }),
        NAMES,
      ),
    ).toEqual(['customers']);
  });

  it('still honours a nested-only claim the group states outright', () => {
    const resolved = withResolvedCoverage(
      design({
        modules: [
          module({
            name: 'Customers',
            basePath: '/api/customers',
            coveredEntities: ['orders'],
            endpoints: [
              {
                method: 'GET',
                path: '/api/customers/:id/orders',
                summary: '',
                requestSchema: [],
                responseSchema: [],
                statusCodes: [200],
              },
            ],
          }),
        ],
      }),
      NAMES,
    );
    expect(resolved.modules[0].coveredEntities!.sort()).toEqual([
      'customers',
      'orders',
    ]);
  });
});

describe('withResolvedCoverage', () => {
  it('backfills coverage a real resource never declared', () => {
    const resolved = withResolvedCoverage(design(), NAMES);
    expect(resolved.modules[0].coveredEntities).toEqual(['orders']);
    expect(validateEntityCoverage(resolved, ['orders']).ok).toBe(true);
  });

  it('drops an exclusion the design contradicts by covering the entity', () => {
    const resolved = withResolvedCoverage(
      design({
        excludedEntities: [{ entity: 'orders', reason: 'junction table' }],
      }),
      NAMES,
    );
    expect(resolved.excludedEntities).toBeUndefined();
  });

  it('drops an exclusion for a table the design does not have', () => {
    // The page renders this list verbatim, so a phantom row would show the user
    // an excluded table that doesn't exist — and an "excluded" count that
    // disagrees with the validator's.
    const resolved = withResolvedCoverage(
      design({
        excludedEntities: [
          { entity: 'schema_migrations', reason: 'Internal table.' },
          { entity: 'products', reason: 'Read-only reference data.' },
        ],
      }),
      NAMES,
    );
    expect(resolved.excludedEntities).toEqual([
      { entity: 'products', reason: 'Read-only reference data.' },
    ]);
  });

  it('is idempotent', () => {
    const once = withResolvedCoverage(design(), NAMES);
    expect(withResolvedCoverage(once, NAMES)).toEqual(once);
  });
});

describe('mergeMissingCoverage', () => {
  it('keeps only groups that fill a gap, and only for the gap', () => {
    const merged = mergeMissingCoverage(
      design({ modules: [module({ coveredEntities: ['orders'] })] }),
      {
        modules: [
          // A redesign of a resource that already exists — must be dropped.
          module({ name: 'Orders redesigned', coveredEntities: ['orders'] }),
          module({
            name: 'Products',
            basePath: '/api/products',
            // Claims a gap plus something already covered.
            coveredEntities: ['products', 'orders'],
          }),
        ],
      },
      ['products'],
    );

    expect(merged.modules.map((m) => m.name)).toEqual(['Orders', 'Products']);
    expect(merged.modules[1].coveredEntities).toEqual(['products']);
  });

  it('uniquifies a group name that collides with an existing one', () => {
    const merged = mergeMissingCoverage(
      design({ modules: [module({ coveredEntities: ['customers'] })] }),
      { modules: [module({ coveredEntities: ['orders'] })] },
      ['orders'],
    );
    expect(merged.modules.map((m) => m.name)).toEqual(['Orders', 'Orders 2']);
  });

  it('takes an exclusion only for a missing entity, and only with a reason', () => {
    const merged = mergeMissingCoverage(
      design({ modules: [module({ coveredEntities: ['orders'] })] }),
      {
        excludedEntities: [
          { entity: 'order_products', reason: 'Join table via Orders.' },
          { entity: 'customers', reason: 'not in the gap' },
          { entity: 'products', reason: '  ' },
        ],
      },
      ['order_products', 'products'],
    );
    expect(merged.excludedEntities).toEqual([
      { entity: 'order_products', reason: 'Join table via Orders.' },
    ]);
  });
});

describe('isJunctionEntity', () => {
  it('is true for a table of nothing but keys', () => {
    expect(isJunctionEntity(DB.entities[3])).toBe(true);
  });

  it('is false when the table carries data of its own', () => {
    // `reviews` has two FKs and a rating — a resource, not a link.
    expect(isJunctionEntity(DB.entities[4])).toBe(false);
  });

  it('is false with a single foreign key', () => {
    expect(isJunctionEntity(DB.entities[1])).toBe(false);
  });
});

describe('buildRestApi', () => {
  it('accounts for every entity of a multi-entity design', () => {
    const built = buildRestApi(DB, { includeAuth: true });
    const result = validateEntityCoverage(
      { ...design(), modules: built.modules, excludedEntities: built.excludedEntities },
      NAMES,
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('gives every non-junction entity full CRUD', () => {
    const { modules } = buildRestApi(DB);
    const products = modules.find((m) => m.name === 'Products')!;
    const methods = products.endpoints
      .filter((e) => e.path.startsWith('/api/products'))
      .map((e) => e.method);
    expect(methods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE']),
    );
    expect(products.coveredEntities).toEqual(['products']);
  });

  it('manages a join table through its parent instead of a resource', () => {
    const { modules, excludedEntities } = buildRestApi(DB);
    expect(modules.find((m) => m.basePath === '/api/order_products')).toBeUndefined();

    const orders = modules.find((m) => m.name === 'Orders')!;
    const nested = orders.endpoints.filter((e) =>
      e.path.startsWith('/api/orders/:id/order_products'),
    );
    expect(nested.map((e) => e.method)).toEqual(['GET', 'POST', 'DELETE']);

    const exclusion = excludedEntities.find((e) => e.entity === 'order_products')!;
    // The contract: an exclusion by nested routes must name the parent resource.
    expect(exclusion.reason).toContain('Orders');
    expect(exclusion.reason).toContain('/api/orders');
  });

  it('hangs a child collection off the parent module, never the child', () => {
    // The child's own controller is mounted at its basePath, so `/api/customers/
    // :id/orders` declared in Orders would generate `/orders/:id/orders`.
    const { modules } = buildRestApi(DB);
    const customers = modules.find((m) => m.name === 'Customers')!;
    const orders = modules.find((m) => m.name === 'Orders')!;
    expect(
      customers.endpoints.some((e) => e.path === '/api/customers/:id/orders'),
    ).toBe(true);
    expect(
      orders.endpoints.some((e) => e.path.startsWith('/api/customers')),
    ).toBe(false);
  });

  it('gives a join table its own resource when the parent is out of scope', () => {
    // The repair path: the parent's group belongs to the model and can't be
    // amended, so a link table gets a resource rather than no coverage at all.
    const { modules, excludedEntities } = buildRestApi(DB, {
      only: ['order_products'],
      source: 'generated-fallback',
    });
    expect(excludedEntities).toEqual([]);
    expect(modules).toHaveLength(1);
    expect(modules[0].basePath).toBe('/api/order_products');
    expect(modules[0].coveredEntities).toEqual(['order_products']);
    expect(modules[0].source).toBe('generated-fallback');
  });

  it('builds only what `only` asks for', () => {
    const { modules } = buildRestApi(DB, { only: ['products', 'reviews'] });
    expect(modules.map((m) => m.name).sort()).toEqual(['Products', 'Reviews']);
  });

  it('keeps server-managed fields out of write bodies but in responses', () => {
    const { modules } = buildRestApi(DB);
    const create = modules
      .find((m) => m.name === 'Customers')!
      .endpoints.find((e) => e.method === 'POST')!;
    expect(create.requestSchema.map((f) => f.name)).toEqual(['email']);
    expect(create.responseSchema.map((f) => f.name)).toContain('id');
  });
});

describe('ensureEntityCoverage', () => {
  it('fills an uncovered entity with a flagged deterministic group', () => {
    const patched = ensureEntityCoverage(
      design({ modules: [module({ coveredEntities: ['orders'] })] }),
      DB,
    );
    expect(validateEntityCoverage(patched, NAMES).ok).toBe(true);

    const products = patched.modules.find((m) => m.name === 'Products')!;
    expect(products.source).toBe('generated-fallback');
    expect(products.endpoints.length).toBeGreaterThan(0);
  });

  it('leaves a fully covered design untouched and unflagged', () => {
    const built = buildRestApi(DB, { includeAuth: true });
    const complete = design({
      modules: built.modules,
      excludedEntities: built.excludedEntities,
    });
    const after = ensureEntityCoverage(complete, DB);
    expect(after.modules.some((m) => m.source === 'generated-fallback')).toBe(false);
    expect(after.modules).toHaveLength(complete.modules.length);
  });
});
