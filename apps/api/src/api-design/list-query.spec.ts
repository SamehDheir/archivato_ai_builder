import { buildRestApi, listQueryParams, type Entity } from '@archivato/shared';

const orders: Entity = {
  name: 'orders',
  description: 'Customer orders.',
  columns: [
    { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
    {
      name: 'customer_id',
      type: 'uuid',
      nullable: false,
      references: { entity: 'customers', column: 'id' },
    },
    { name: 'reference', type: 'string', nullable: false },
    { name: 'status', type: 'enum', nullable: false },
    { name: 'total', type: 'decimal', nullable: false },
    { name: 'created_at', type: 'timestamp', nullable: false },
    { name: 'updated_at', type: 'timestamp', nullable: false },
  ],
};

const names = (entity: Entity) => listQueryParams(entity).map((p) => p.name);

describe('listQueryParams', () => {
  it('keeps pagination', () => {
    expect(names(orders)).toEqual(expect.arrayContaining(['page', 'limit']));
  });

  it('derives search, lifecycle, date range and FK filters from the columns', () => {
    expect(names(orders)).toEqual(
      expect.arrayContaining([
        'search',
        'status',
        'created_from',
        'created_to',
        'customer_id',
      ]),
    );
  });

  it('marks every filter optional', () => {
    for (const param of listQueryParams(orders)) {
      expect(param.required).toBe(false);
    }
  });

  it('omits search when the entity has no text column to search', () => {
    const readings: Entity = {
      name: 'readings',
      description: 'Sensor readings.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'value', type: 'decimal', nullable: false },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
    };
    expect(names(readings)).not.toContain('search');
    expect(names(readings)).toContain('created_from');
  });

  it('omits a lifecycle filter for an entity that has no lifecycle', () => {
    const countries: Entity = {
      name: 'countries',
      description: 'Reference list.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
      ],
    };
    expect(names(countries)).not.toContain('status');
    expect(names(countries)).toContain('search');
  });

  it('never exposes a secret column as a filter', () => {
    const users: Entity = {
      name: 'users',
      description: 'Accounts.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'password_hash', type: 'string', nullable: false },
        { name: 'reset_token', type: 'string', nullable: true },
      ],
    };
    const params = names(users);
    expect(params).not.toContain('password_hash');
    expect(params).not.toContain('reset_token');
    // Neither column is searchable text, so no free-text search either.
    expect(params).not.toContain('search');
  });

  it('falls back to a domain date column when there is no created_at', () => {
    const invoices: Entity = {
      name: 'invoices',
      description: 'Invoices.',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'issued_at', type: 'timestamp', nullable: false },
      ],
    };
    expect(names(invoices)).toEqual(
      expect.arrayContaining(['issued_from', 'issued_to']),
    );
  });

  it('produces no duplicate parameter names', () => {
    const params = names(orders);
    expect(new Set(params).size).toBe(params.length);
  });
});

describe('buildRestApi list endpoints', () => {
  it('carries the derived query params through to the collection GET', () => {
    const { modules } = buildRestApi({
      sessionId: 's',
      generatedAt: 'now',
      databaseType: 'PostgreSQL',
      entities: [orders],
      relations: [],
    });
    const list = modules[0].endpoints.find(
      (e) => e.method === 'GET' && !e.path.includes(':id'),
    );
    expect(list).toBeDefined();
    const params = list!.requestSchema.map((f) => f.name);
    expect(params).toEqual(
      expect.arrayContaining(['page', 'limit', 'search', 'status']),
    );
  });

  it('leaves write bodies alone', () => {
    const { modules } = buildRestApi({
      sessionId: 's',
      generatedAt: 'now',
      databaseType: 'PostgreSQL',
      entities: [orders],
      relations: [],
    });
    const post = modules[0].endpoints.find((e) => e.method === 'POST');
    const body = post!.requestSchema.map((f) => f.name);
    expect(body).not.toContain('page');
    expect(body).not.toContain('created_from');
    expect(body).not.toContain('id');
  });
});
