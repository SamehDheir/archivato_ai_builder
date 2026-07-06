import {
  buildBackendScaffold,
  type ApiDesign,
  type DatabaseDesign,
  type ScaffoldInput,
  type SystemDesign,
} from '@archivato/shared';

const systemDesign = {
  architecture: 'modular_monolith',
} as SystemDesign;

const databaseDesign: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'App users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, unique: true },
        { name: 'age', type: 'integer', nullable: true },
      ],
    },
    {
      // No primary key → the scaffolder must synthesize one.
      name: 'posts',
      description: 'User posts',
      columns: [
        { name: 'title', type: 'string', nullable: false },
        {
          name: 'author_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'users', column: 'id' },
        },
      ],
    },
  ],
  relations: [],
};

const apiDesign: ApiDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  modules: [
    {
      name: 'Users',
      basePath: '/api/users',
      endpoints: [
        {
          method: 'GET',
          path: '/api/users',
          summary: 'List users',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [200],
        },
        {
          method: 'GET',
          path: '/api/users/:id',
          summary: 'Get a user',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [200, 404],
        },
        {
          method: 'POST',
          path: '/api/users',
          summary: 'Create a user',
          requestSchema: [
            { name: 'email', type: 'string', required: true },
            { name: 'age', type: 'integer', required: false },
            // Server-managed — must be dropped from the DTO.
            { name: 'id', type: 'uuid', required: false },
          ],
          responseSchema: [],
          statusCodes: [201],
        },
      ],
    },
  ],
};

const input: ScaffoldInput = {
  idea: 'A blogging platform',
  systemDesign,
  databaseDesign,
  apiDesign,
};

function fileMap(): Map<string, string> {
  return new Map(buildBackendScaffold(input).map((f) => [f.path, f.content]));
}

describe('buildBackendScaffold', () => {
  it('emits a valid Prisma schema with datasource + models', () => {
    const schema = fileMap().get('prisma/schema.prisma')!;
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).toContain('model Users {');
    expect(schema).toContain('model Posts {');
    expect(schema).toContain('@@map("users")');
    // PK column becomes @id with a uuid default.
    expect(schema).toMatch(/id String @id @default\(uuid\(\)\)/);
    // Unique flag carried over.
    expect(schema).toContain('email String @unique');
  });

  it('synthesizes an id for an entity without a primary key', () => {
    const schema = fileMap().get('prisma/schema.prisma')!;
    const posts = schema.slice(schema.indexOf('model Posts'));
    expect(posts).toMatch(/id String @id @default\(uuid\(\)\)/);
    // FK emitted as a scalar field with a documenting comment.
    expect(posts).toContain('// FK → users.id');
  });

  it('maps endpoints to a controller with correct routes', () => {
    const controller = fileMap().get(
      'src/modules/users/users.controller.ts',
    )!;
    expect(controller).toContain("@Controller('users')");
    expect(controller).toContain('@Get()');
    expect(controller).toContain("@Get(':id')");
    expect(controller).toContain("@Param('id') id: string");
    expect(controller).toContain('@Post()');
    // Distinct handler names for the two GETs.
    expect(controller).toContain('findAll(');
    expect(controller).toContain('findOne(');
  });

  it('generates a request DTO that excludes server-managed fields', () => {
    const files = fileMap();
    const dto = files.get('src/modules/users/dto/create-dto.ts')!;
    expect(dto).toBeDefined();
    expect(dto).toContain('export class CreateDto');
    expect(dto).toContain('@IsString()');
    expect(dto).toContain('email: string;');
    expect(dto).toContain('@IsOptional()');
    expect(dto).toContain('age?: number;');
    // The server-managed `id` must not appear as a DTO field.
    expect(dto).not.toMatch(/\n {2}id[?]?:/);
  });

  it('wires every module into app.module and includes root files', () => {
    const files = fileMap();
    const appModule = files.get('src/app.module.ts')!;
    expect(appModule).toContain('UsersModule');
    expect(appModule).toContain('PrismaModule');

    expect(files.has('package.json')).toBe(true);
    expect(() => JSON.parse(files.get('package.json')!)).not.toThrow();
    expect(files.has('src/main.ts')).toBe(true);
    expect(files.has('src/prisma/prisma.service.ts')).toBe(true);
    expect(files.get('README.md')).toContain('A blogging platform');
  });

  it('produces a deterministic, unique, sorted file set', () => {
    const a = buildBackendScaffold(input).map((f) => f.path);
    const b = buildBackendScaffold(input).map((f) => f.path);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect([...a].sort((x, y) => x.localeCompare(y))).toEqual(a);
  });

  it('promotes an unflagged `id` column instead of emitting a duplicate id', () => {
    const db: DatabaseDesign = {
      sessionId: 's',
      generatedAt: 'now',
      databaseType: 'PostgreSQL',
      entities: [
        {
          name: 'widgets',
          description: '',
          // An `id` column that the design forgot to flag as primaryKey.
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'label', type: 'string', nullable: false },
          ],
        },
      ],
      relations: [],
    };
    const schema = new Map(
      buildBackendScaffold({ ...input, databaseDesign: db }).map((f) => [
        f.path,
        f.content,
      ]),
    ).get('prisma/schema.prisma')!;
    const model = schema.slice(schema.indexOf('model Widgets'));
    // Exactly one `id` field, and it carries @id (no synthesized duplicate).
    expect((model.match(/^\s*id\s/gm) ?? []).length).toBe(1);
    expect(model).toMatch(/id String @id/);
  });

  it('uniquifies API modules whose names collide into the same identifier', () => {
    const api: ApiDesign = {
      sessionId: 's',
      generatedAt: 'now',
      modules: [
        { name: 'Order Items', basePath: '/api/order-items', endpoints: [] },
        { name: 'OrderItems', basePath: '/api/orderitems', endpoints: [] },
      ],
    };
    const paths = buildBackendScaffold({ ...input, apiDesign: api }).map(
      (f) => f.path,
    );
    // No duplicate file paths despite the colliding module names.
    expect(new Set(paths).size).toBe(paths.length);
    const appModule = new Map(
      buildBackendScaffold({ ...input, apiDesign: api }).map((f) => [
        f.path,
        f.content,
      ]),
    ).get('src/app.module.ts')!;
    // Two distinct module classes are imported (no duplicate identifier).
    expect(appModule).toContain('OrderItemsModule');
    expect(appModule).toContain('OrderItems2Module');
  });
});
