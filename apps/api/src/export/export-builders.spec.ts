import {
  buildPostmanCollection,
  buildSqlDdl,
  type ApiDesign,
  type DatabaseDesign,
} from '@archivato/shared';

describe('buildSqlDdl', () => {
  const design: DatabaseDesign = {
    sessionId: 's',
    generatedAt: 't',
    databaseType: 'PostgreSQL',
    entities: [
      {
        name: 'users',
        description: 'Accounts',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          { name: 'email', type: 'string', nullable: false, unique: true },
        ],
      },
      {
        name: 'invoices',
        description: '',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          {
            name: 'user_id',
            type: 'uuid',
            nullable: false,
            references: { entity: 'users', column: 'id' },
          },
          { name: 'amount', type: 'decimal', nullable: false },
        ],
      },
    ],
    relations: [],
  };

  it('emits quoted CREATE TABLE with mapped types, NOT NULL, UNIQUE, and PK', () => {
    const sql = buildSqlDdl(design);
    expect(sql).toContain('CREATE TABLE "users" (');
    expect(sql).toContain('"email" VARCHAR(255) NOT NULL UNIQUE');
    expect(sql).toContain('PRIMARY KEY ("id")');
  });

  it('emits foreign keys as ALTER TABLE after all tables exist', () => {
    const sql = buildSqlDdl(design);
    const fk =
      'ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" ' +
      'FOREIGN KEY ("user_id") REFERENCES "users" ("id");';
    expect(sql).toContain(fk);
    // The FK statement must come after the table that references it is created.
    expect(sql.indexOf(fk)).toBeGreaterThan(sql.indexOf('CREATE TABLE "invoices"'));
  });
});

describe('buildPostmanCollection', () => {
  const api: ApiDesign = {
    sessionId: 's',
    generatedAt: 't',
    modules: [
      {
        name: 'Users',
        basePath: '/api/users',
        endpoints: [
          {
            method: 'GET',
            path: '/api/users',
            summary: 'List users.',
            requestSchema: [{ name: 'page', type: 'integer', required: false }],
            responseSchema: [],
            statusCodes: [200],
          },
          {
            method: 'POST',
            path: '/api/users',
            summary: 'Create a user.',
            requestSchema: [{ name: 'email', type: 'string', required: true }],
            responseSchema: [],
            statusCodes: [201],
          },
          {
            method: 'GET',
            path: '/api/users/:id',
            summary: 'Get a user.',
            requestSchema: [],
            responseSchema: [],
            statusCodes: [200, 404],
          },
        ],
      },
    ],
  };

  it('is a v2.1 collection with a folder per module', () => {
    const col = buildPostmanCollection('My API', api) as {
      info: { schema: string };
      item: { name: string; item: unknown[] }[];
    };
    expect(col.info.schema).toContain('v2.1.0');
    expect(col.item[0].name).toBe('Users');
    expect(col.item[0].item).toHaveLength(3);
  });

  it('prefills a JSON body on writes and query/path params on reads', () => {
    const col = buildPostmanCollection('My API', api) as {
      item: { item: Record<string, never>[] }[];
    };
    const items = col.item[0].item as unknown as {
      name: string;
      request: {
        method: string;
        body?: { mode: string; raw: string };
        url: {
          raw: string;
          query?: { key: string }[];
          variable?: { key: string }[];
        };
      };
    }[];

    const post = items.find((i) => i.request.method === 'POST')!;
    expect(post.request.body?.mode).toBe('raw');
    expect(JSON.parse(post.request.body!.raw)).toHaveProperty('email');

    const list = items.find((i) => i.name === 'List users.')!;
    expect(list.request.url.query?.[0].key).toBe('page');

    const byId = items.find((i) => i.request.url.raw.includes(':id'))!;
    expect(byId.request.url.variable?.[0].key).toBe('id');
  });
});
