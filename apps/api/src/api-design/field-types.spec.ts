import {
  buildSchemaTypeIndex,
  contextEntitiesFor,
  describeColumns,
  pathParamType,
  reconcileApiFieldTypes,
  resolveFieldType,
  sameFieldType,
  type ApiDesign,
  type DatabaseDesign,
  type Entity,
} from '@archivato/shared';

/**
 * Cross-stage field-type consistency.
 *
 * The reported bug: a 12-module, 48-endpoint API design typed **every** id as
 * `integer` — path params, request bodies, response bodies — against a schema
 * whose primary keys are all `uuid`. A team building against that document would
 * assume auto-incrementing integers and hit the mismatch on their first insert.
 *
 * The cause was a prompt that printed the entities' column NAMES and no types,
 * while telling the model "field names match the data model". It filled the gap
 * with the REST convention that dominates its training data. The deterministic
 * builder, which copies `c.type` off the column, was right all along.
 *
 * The fix is the standing two-part split: the prompt now prints real types
 * (`describeColumns`), and `reconcileApiFieldTypes` enforces them on the output
 * whatever the model does. This file pins both, plus the generality case — the
 * rule is "the database decides every type", not "ids are uuid".
 */

const col = (
  name: string,
  type: string,
  over: Partial<{ nullable: boolean; primaryKey: boolean; unique: boolean; references: { entity: string; column: string } }> = {},
) => ({ name, type, nullable: false, ...over });

const entity = (name: string, columns: Entity['columns']): Entity => ({
  name,
  description: '',
  columns,
});

/** A uuid-keyed clinical schema, the shape MedCore's actually is. */
const clinicSchema = (): DatabaseDesign => ({
  sessionId: 's1',
  generatedAt: '2026-07-23T00:00:00.000Z',
  databaseType: 'PostgreSQL',
  entities: [
    entity('branches', [col('id', 'uuid', { primaryKey: true }), col('name', 'string')]),
    entity('doctors', [col('id', 'uuid', { primaryKey: true }), col('full_name', 'string')]),
    entity('patients', [
      col('id', 'uuid', { primaryKey: true }),
      col('national_id', 'string', { unique: true }),
      col('full_name', 'string'),
      col('date_of_birth', 'date'),
      col('created_at', 'timestamp'),
    ]),
    entity('patient_records', [
      col('id', 'uuid', { primaryKey: true }),
      col('patient_id', 'uuid', { references: { entity: 'patients', column: 'id' } }),
      col('doctor_id', 'uuid', { references: { entity: 'doctors', column: 'id' } }),
      col('notes', 'text'),
      col('recorded_at', 'timestamp'),
    ]),
    entity('appointments', [
      col('id', 'uuid', { primaryKey: true }),
      col('branch_id', 'uuid', { references: { entity: 'branches', column: 'id' } }),
      col('patient_id', 'uuid', { references: { entity: 'patients', column: 'id' } }),
      col('doctor_id', 'uuid', { references: { entity: 'doctors', column: 'id' } }),
      col('scheduled_at', 'timestamp'),
      col('status', 'enum'),
      col('fee', 'decimal'),
      col('is_walk_in', 'boolean'),
    ]),
  ],
  relations: [],
});

/** What the model produced: every id an integer, and dates/decimals flattened. */
const integerIdApiDesign = (): ApiDesign => ({
  sessionId: 's1',
  generatedAt: '2026-07-23T00:00:00.000Z',
  modules: [
    {
      name: 'PatientRecords',
      basePath: '/api/patient-records',
      coveredEntities: ['patient_records'],
      endpoints: [
        {
          method: 'GET',
          path: '/api/patient-records/:id',
          summary: 'Fetch one record.',
          requestSchema: [],
          responseSchema: [
            { name: 'id', type: 'integer', required: true },
            { name: 'patient_id', type: 'integer', required: true },
            { name: 'doctor_id', type: 'integer', required: true },
            { name: 'notes', type: 'string', required: false },
            { name: 'recorded_at', type: 'string', required: true },
          ],
          statusCodes: [200, 404],
        },
      ],
    },
    {
      name: 'Appointments',
      basePath: '/api/appointments',
      coveredEntities: ['appointments'],
      endpoints: [
        {
          method: 'POST',
          path: '/api/appointments',
          summary: 'Book an appointment.',
          requestSchema: [
            { name: 'branch_id', type: 'integer', required: true },
            { name: 'patient_id', type: 'integer', required: true },
            { name: 'doctor_id', type: 'integer', required: true },
            { name: 'scheduled_at', type: 'string', required: true },
            { name: 'status', type: 'string', required: false },
            { name: 'fee', type: 'number', required: false },
            { name: 'is_walk_in', type: 'string', required: false },
          ],
          responseSchema: [
            { name: 'id', type: 'integer', required: true },
            { name: 'patient_id', type: 'integer', required: true },
          ],
          statusCodes: [201, 400],
        },
        {
          method: 'GET',
          path: '/api/appointments',
          summary: 'List appointments.',
          requestSchema: [
            { name: 'page', type: 'integer', required: false },
            { name: 'limit', type: 'integer', required: false },
            { name: 'patient_id', type: 'integer', required: false },
          ],
          responseSchema: [{ name: 'id', type: 'integer', required: true }],
          statusCodes: [200],
        },
      ],
    },
    {
      name: 'Auth',
      basePath: '/api/auth',
      coveredEntities: [],
      endpoints: [
        {
          method: 'POST',
          path: '/api/auth/login',
          summary: 'Sign in.',
          requestSchema: [
            { name: 'email', type: 'string', required: true },
            { name: 'password', type: 'string', required: true },
          ],
          responseSchema: [{ name: 'accessToken', type: 'string', required: true }],
          statusCodes: [200, 401],
        },
      ],
    },
  ],
});

const field = (design: ApiDesign, path: string, method: string, kind: 'requestSchema' | 'responseSchema', name: string) =>
  design.modules
    .flatMap((m) => m.endpoints)
    .find((e) => e.path === path && e.method === method)?.[kind]
    .find((f) => f.name === name);

// ── the reported bug ───────────────────────────────────────────────────────

describe('MedCore — integer ids against a uuid schema', () => {
  it('rewrites every id field to the schema type', () => {
    const { design } = reconcileApiFieldTypes(integerIdApiDesign(), clinicSchema());

    // GET /api/patient-records/:id — response body
    expect(field(design, '/api/patient-records/:id', 'GET', 'responseSchema', 'id')?.type).toBe('uuid');
    expect(field(design, '/api/patient-records/:id', 'GET', 'responseSchema', 'patient_id')?.type).toBe('uuid');
    expect(field(design, '/api/patient-records/:id', 'GET', 'responseSchema', 'doctor_id')?.type).toBe('uuid');

    // POST /api/appointments — request body
    expect(field(design, '/api/appointments', 'POST', 'requestSchema', 'branch_id')?.type).toBe('uuid');
    expect(field(design, '/api/appointments', 'POST', 'requestSchema', 'patient_id')?.type).toBe('uuid');
    expect(field(design, '/api/appointments', 'POST', 'requestSchema', 'doctor_id')?.type).toBe('uuid');
    expect(field(design, '/api/appointments', 'POST', 'responseSchema', 'id')?.type).toBe('uuid');

    // …and a query parameter that names a real column.
    expect(field(design, '/api/appointments', 'GET', 'requestSchema', 'patient_id')?.type).toBe('uuid');
  });

  it('leaves no integer id anywhere in the design', () => {
    const { design } = reconcileApiFieldTypes(integerIdApiDesign(), clinicSchema());
    const offenders = design.modules
      .flatMap((m) => m.endpoints)
      .flatMap((e) => [...e.requestSchema, ...e.responseSchema])
      .filter((f) => /(^id$|_id$)/.test(f.name) && f.type !== 'uuid');
    expect(offenders).toEqual([]);
  });

  /**
   * Aggregated by (entity, field, from, to) — so the three appointment endpoints
   * carrying `patient_id` collapse into one row, while the same column name on
   * `patient_records` stays its own row. Merging those two would report a field
   * against a table it does not belong to.
   */
  it('reports corrections aggregated by field, not one per endpoint', () => {
    const { corrections } = reconcileApiFieldTypes(integerIdApiDesign(), clinicSchema());

    expect(corrections).toContainEqual({
      entity: 'appointments',
      field: 'patient_id',
      from: 'integer',
      to: 'uuid',
      occurrences: 3,
    });
    expect(corrections).toContainEqual({
      entity: 'patient_records',
      field: 'patient_id',
      from: 'integer',
      to: 'uuid',
      occurrences: 1,
    });
    // ~20 wrong fields across the endpoints, reported as a handful of rows.
    expect(corrections.length).toBeLessThan(12);
    // Most-frequent first, so the worst offender is what the owner reads.
    expect(corrections[0].occurrences).toBeGreaterThanOrEqual(corrections.at(-1)!.occurrences);
  });

  it('types path params from the real primary key', () => {
    const types = buildSchemaTypeIndex(clinicSchema());
    expect(pathParamType(types, '/api/patient-records/:id', 'id')).toBe('uuid');
    expect(pathParamType(types, '/api/patients/:id/appointments', 'id')).toBe('uuid');
    expect(pathParamType(types, '/api/appointments/:patient_id', 'patient_id')).toBe('uuid');
  });
});

// ── generality: every type, not just ids ───────────────────────────────────

describe('generality — the database decides every type', () => {
  it('corrects enum, timestamp, decimal, boolean and text alike', () => {
    const { design } = reconcileApiFieldTypes(integerIdApiDesign(), clinicSchema());
    const body = (name: string) => field(design, '/api/appointments', 'POST', 'requestSchema', name)?.type;

    expect(body('status')).toBe('enum');
    expect(body('scheduled_at')).toBe('timestamp');
    expect(body('fee')).toBe('decimal');
    expect(body('is_walk_in')).toBe('boolean');
    expect(field(design, '/api/patient-records/:id', 'GET', 'responseSchema', 'recorded_at')?.type).toBe('timestamp');
  });

  /**
   * A different project, a different schema, an integer-keyed one — the rule must
   * follow the database rather than having learned "ids are uuid".
   */
  it('leaves integer ids alone when the schema really is integer-keyed', () => {
    const legacy: DatabaseDesign = {
      sessionId: 's2',
      generatedAt: '2026-07-23T00:00:00.000Z',
      databaseType: 'MySQL',
      entities: [
        entity('products', [col('id', 'integer', { primaryKey: true }), col('sku', 'string')]),
        entity('orders', [
          col('id', 'integer', { primaryKey: true }),
          col('product_id', 'integer', { references: { entity: 'products', column: 'id' } }),
        ]),
      ],
      relations: [],
    };
    const design: ApiDesign = {
      sessionId: 's2',
      generatedAt: '2026-07-23T00:00:00.000Z',
      modules: [
        {
          name: 'Orders',
          basePath: '/api/orders',
          coveredEntities: ['orders'],
          endpoints: [
            {
              method: 'POST',
              path: '/api/orders',
              summary: 'Create.',
              requestSchema: [{ name: 'product_id', type: 'integer', required: true }],
              responseSchema: [{ name: 'id', type: 'integer', required: true }],
              statusCodes: [201],
            },
          ],
        },
      ],
    };

    const { design: out, corrections } = reconcileApiFieldTypes(design, legacy);
    expect(corrections).toEqual([]);
    expect(out).toBe(design); // untouched — same reference
  });

  /** The scenario you asked for: an enum in the DB, a plain string in the API. */
  it('picks up an enum the API flattened to string, in an unrelated domain', () => {
    const shipping: DatabaseDesign = {
      sessionId: 's3',
      generatedAt: '2026-07-23T00:00:00.000Z',
      databaseType: 'PostgreSQL',
      entities: [
        entity('shipments', [
          col('id', 'uuid', { primaryKey: true }),
          col('delivery_state', 'enum'),
          col('weight_kg', 'decimal'),
          col('dispatched_on', 'date'),
        ]),
      ],
      relations: [],
    };
    const design: ApiDesign = {
      sessionId: 's3',
      generatedAt: '2026-07-23T00:00:00.000Z',
      modules: [
        {
          name: 'Shipments',
          basePath: '/api/shipments',
          coveredEntities: ['shipments'],
          endpoints: [
            {
              method: 'GET',
              path: '/api/shipments',
              summary: 'List.',
              requestSchema: [
                { name: 'page', type: 'integer', required: false },
                { name: 'delivery_state', type: 'string', required: false },
              ],
              responseSchema: [
                { name: 'id', type: 'string', required: true },
                { name: 'delivery_state', type: 'string', required: true },
                { name: 'weight_kg', type: 'string', required: true },
                { name: 'dispatched_on', type: 'string', required: true },
              ],
              statusCodes: [200],
            },
          ],
        },
      ],
    };

    const { design: out, corrections } = reconcileApiFieldTypes(design, shipping);
    const res = (name: string) => field(out, '/api/shipments', 'GET', 'responseSchema', name)?.type;
    expect(res('id')).toBe('uuid');
    expect(res('delivery_state')).toBe('enum');
    expect(res('weight_kg')).toBe('decimal');
    expect(res('dispatched_on')).toBe('date');
    expect(field(out, '/api/shipments', 'GET', 'requestSchema', 'delivery_state')?.type).toBe('enum');
    // page is not a column, so nothing was invented for it.
    expect(field(out, '/api/shipments', 'GET', 'requestSchema', 'page')?.type).toBe('integer');
    // `delivery_state` was wrong in both the query and the response; one row, two
    // occurrences.
    expect(corrections.map((c) => c.field).sort()).toEqual([
      'delivery_state',
      'dispatched_on',
      'id',
      'weight_kg',
    ]);
    expect(corrections.find((c) => c.field === 'delivery_state')?.occurrences).toBe(2);
  });
});

// ── conservatism: only rewrite what the schema actually defines ────────────

describe('conservatism — never invent a type', () => {
  it('leaves non-column fields completely alone', () => {
    const { design } = reconcileApiFieldTypes(integerIdApiDesign(), clinicSchema());
    expect(field(design, '/api/auth/login', 'POST', 'responseSchema', 'accessToken')?.type).toBe('string');
    expect(field(design, '/api/appointments', 'GET', 'requestSchema', 'page')?.type).toBe('integer');
    expect(field(design, '/api/appointments', 'GET', 'requestSchema', 'limit')?.type).toBe('integer');
  });

  /**
   * `POST /api/auth/register` returns the created user, but the Auth module
   * covers no entity by construction, so its `id` resolved to nothing and stayed
   * `integer` — the bug surviving in the endpoint every consumer calls first.
   * Found by auditing MedCore's real design, not by reading the code.
   */
  it('resolves the Auth module against the users table', () => {
    const db = clinicSchema();
    db.entities.push(entity('users', [col('id', 'uuid', { primaryKey: true }), col('email', 'string')]));
    const design: ApiDesign = {
      sessionId: 's5',
      generatedAt: '2026-07-23T00:00:00.000Z',
      modules: [
        {
          name: 'Auth',
          basePath: '/api/auth',
          coveredEntities: [],
          endpoints: [
            {
              method: 'POST',
              path: '/api/auth/register',
              summary: 'Register.',
              requestSchema: [{ name: 'email', type: 'string', required: true }],
              responseSchema: [
                { name: 'id', type: 'integer', required: true },
                { name: 'accessToken', type: 'string', required: true },
              ],
              statusCodes: [201],
            },
          ],
        },
      ],
    };

    const { design: out } = reconcileApiFieldTypes(design, db);
    expect(field(out, '/api/auth/register', 'POST', 'responseSchema', 'id')?.type).toBe('uuid');
    expect(field(out, '/api/auth/register', 'POST', 'responseSchema', 'accessToken')?.type).toBe('string');
  });

  /**
   * A `<noun>_id` names its target table outright, so it resolves with no module
   * context at all. An earlier cut skipped context-less endpoints as a
   * micro-optimization and silently switched that rule off for the modules most
   * likely to need it.
   */
  it('resolves a foreign key in a module that covers nothing', () => {
    const index = buildSchemaTypeIndex(clinicSchema());
    expect(resolveFieldType(index, 'branch_id', [])?.type).toBe('uuid');
    expect(resolveFieldType(index, 'patient_record_id', [])?.type).toBe('uuid');
    expect(resolveFieldType(index, 'id', [])).toBeNull();
  });

  it('does not touch a `_ids` array (the role-cardinality convention)', () => {
    const db: DatabaseDesign = {
      sessionId: 's4',
      generatedAt: '2026-07-23T00:00:00.000Z',
      databaseType: 'PostgreSQL',
      entities: [
        entity('roles', [col('id', 'uuid', { primaryKey: true })]),
        entity('users', [col('id', 'uuid', { primaryKey: true })]),
      ],
      relations: [],
    };
    const index = buildSchemaTypeIndex(db);
    expect(resolveFieldType(index, 'role_ids', ['users'])).toBeNull();
    expect(resolveFieldType(index, 'role_id', ['users'])?.type).toBe('uuid');
  });

  it('is a no-op with no database design at all', () => {
    const input = integerIdApiDesign();
    const { design, corrections } = reconcileApiFieldTypes(input, null);
    expect(design).toBe(input);
    expect(corrections).toEqual([]);
  });

  it('does not churn on a cosmetic spelling of the same type', () => {
    expect(sameFieldType('varchar(255)', 'string')).toBe(true);
    expect(sameFieldType('timestamp with time zone', 'timestamp')).toBe(true);
    expect(sameFieldType('numeric(10,2)', 'decimal')).toBe(true);
    expect(sameFieldType('bigint', 'integer')).toBe(true);
    // The one that must never be forgiven.
    expect(sameFieldType('integer', 'uuid')).toBe(false);
  });

  /**
   * A nested route returns the CHILD, so its `id` is the child's. Reading the
   * parent would type the whole nested response off the wrong table.
   */
  it('resolves a nested route against the last entity in the path', () => {
    const index = buildSchemaTypeIndex(clinicSchema());
    const context = contextEntitiesFor(
      index,
      { basePath: '/api/patients', coveredEntities: ['patients'] },
      { path: '/api/patients/:id/appointments' },
    );
    expect(context[0]).toBe('appointments');
    expect(resolveFieldType(index, 'status', context)?.type).toBe('enum');
  });
});

// ── the source fix: the prompt must carry the types ───────────────────────

describe('describeColumns — the root cause', () => {
  it('prints the type, the PK and the FK target for every column', () => {
    const line = describeColumns(
      clinicSchema().entities.find((e) => e.name === 'appointments')!,
    );
    expect(line).toContain('id uuid PK');
    expect(line).toContain('patient_id uuid FK→patients');
    expect(line).toContain('status enum');
    expect(line).toContain('fee decimal');
    // The old prompt printed bare names — the whole reason the model guessed.
    expect(line).not.toBe('id, branch_id, patient_id, doctor_id, scheduled_at, status, fee, is_walk_in');
  });

  it('says so out loud rather than silently truncating a wide table', () => {
    const wide = entity(
      'wide',
      Array.from({ length: 30 }, (_, i) => col(`c${i}`, 'string')),
    );
    expect(describeColumns(wide)).toContain('and 6 more columns');
  });
});
