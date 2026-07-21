import {
  enforceRoleCardinality,
  userRoleCardinality,
  type ApiDesign,
  type DatabaseDesign,
  type Entity,
} from '@archivato/shared';

/**
 * Bug U: the database modelled users↔roles many-to-many (a `user_roles` join)
 * while the API's create/update-user body accepted a single `role_id` — so the
 * API could not use the multi-role capability the schema was built for. The API
 * stage must READ the schema's cardinality, not guess.
 */

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
const db = (entities: Entity[], relations: DatabaseDesign['relations'] = []): DatabaseDesign => ({
  sessionId: 's1',
  generatedAt: '2026-07-20T00:00:00.000Z',
  databaseType: 'PostgreSQL',
  entities,
  relations,
});

describe('userRoleCardinality', () => {
  it('is many when a user_roles junction table links users and roles', () => {
    const design = db([
      entity('users', [col('id')]),
      entity('roles', [col('id')]),
      entity('user_roles', [col('id'), col('user_id', 'users'), col('role_id', 'roles')]),
    ]);
    expect(userRoleCardinality(design)).toBe('many');
  });

  it('is many when the schema declares a users↔roles many-to-many relation', () => {
    const design = db(
      [entity('users', [col('id')]), entity('roles', [col('id')])],
      [{ from: 'users', to: 'roles', type: 'many-to-many' }],
    );
    expect(userRoleCardinality(design)).toBe('many');
  });

  it('is single when users carries a role_id FK', () => {
    const design = db([
      entity('users', [col('id'), col('role_id', 'roles')]),
      entity('roles', [col('id')]),
    ]);
    expect(userRoleCardinality(design)).toBe('single');
  });

  it('is null when there is no roles table', () => {
    expect(userRoleCardinality(db([entity('users', [col('id')])]))).toBeNull();
  });
});

describe('enforceRoleCardinality', () => {
  const usersModule = (roleField: string): ApiDesign => ({
    sessionId: 's1',
    generatedAt: '2026-07-20T00:00:00.000Z',
    modules: [
      {
        name: 'Users',
        basePath: '/api/users',
        coveredEntities: ['users'],
        endpoints: [
          {
            method: 'POST',
            path: '/api/users',
            summary: 'Create a user',
            requestSchema: [
              { name: 'email', type: 'string', required: true },
              { name: roleField, type: 'integer', required: true },
            ],
            responseSchema: [{ name: 'id', type: 'uuid', required: true }],
            statusCodes: [201, 400],
          },
        ],
      },
    ],
  });

  const m2mDb = db([
    entity('users', [col('id')]),
    entity('roles', [col('id')]),
    entity('user_roles', [col('id'), col('user_id', 'users'), col('role_id', 'roles')]),
  ]);

  it('rewrites role_id to role_ids[] when the schema is many-to-many', () => {
    const { design, changed } = enforceRoleCardinality(usersModule('role_id'), m2mDb);
    expect(changed).toBe(true);
    const field = design.modules[0].endpoints[0].requestSchema.find(
      (f) => /^role_ids$/i.test(f.name),
    );
    expect(field).toEqual({ name: 'role_ids', type: 'array', required: true });
    // The single-role field is gone.
    expect(
      design.modules[0].endpoints[0].requestSchema.some((f) => f.name === 'role_id'),
    ).toBe(false);
  });

  it('leaves a single-role design untouched', () => {
    const singleDb = db([
      entity('users', [col('id'), col('role_id', 'roles')]),
      entity('roles', [col('id')]),
    ]);
    const input = usersModule('role_id');
    const { design, changed } = enforceRoleCardinality(input, singleDb);
    expect(changed).toBe(false);
    expect(design).toBe(input);
  });

  it('is a no-op when the user module has no role field', () => {
    const noRoleField: ApiDesign = {
      sessionId: 's1',
      generatedAt: '2026-07-20T00:00:00.000Z',
      modules: [
        {
          name: 'Users',
          basePath: '/api/users',
          coveredEntities: ['users'],
          endpoints: [
            {
              method: 'POST',
              path: '/api/users',
              summary: 'Create a user',
              requestSchema: [{ name: 'email', type: 'string', required: true }],
              responseSchema: [],
              statusCodes: [201],
            },
          ],
        },
      ],
    };
    expect(enforceRoleCardinality(noRoleField, m2mDb).changed).toBe(false);
  });
});
