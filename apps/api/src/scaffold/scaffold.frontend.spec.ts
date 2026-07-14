import {
  buildFrontendScaffold,
  buildScaffold,
  normalizeScaffoldTarget,
  type ApiDesign,
  type DatabaseDesign,
  type ScaffoldInput,
  type SystemDesign,
} from '@archivato/shared';

const systemDesign = { architecture: 'modular_monolith' } as SystemDesign;

const databaseDesign: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'App users',
      columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
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
          requestSchema: [{ name: 'page', type: 'integer', required: false }],
          responseSchema: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'email', type: 'string', required: true },
            { name: 'is_active', type: 'boolean', required: false },
          ],
          statusCodes: [200],
        },
        {
          method: 'GET',
          path: '/api/users/:id',
          summary: 'Get a user',
          requestSchema: [],
          // Deliberately thinner than the list response.
          responseSchema: [{ name: 'id', type: 'uuid', required: true }],
          statusCodes: [200, 404],
        },
        {
          method: 'POST',
          path: '/api/users',
          summary: 'Create a user',
          requestSchema: [
            { name: 'email', type: 'string', required: true },
            { name: 'age', type: 'integer', required: false },
            // Server-managed — must never reach the form or the body type.
            { name: 'id', type: 'uuid', required: false },
          ],
          responseSchema: [],
          statusCodes: [201],
        },
        {
          method: 'PATCH',
          path: '/api/users/:id',
          summary: 'Update a user',
          requestSchema: [{ name: 'email', type: 'string', required: false }],
          responseSchema: [],
          statusCodes: [200],
        },
        {
          method: 'DELETE',
          path: '/api/users/:id',
          summary: 'Delete a user',
          requestSchema: [],
          responseSchema: [],
          statusCodes: [204],
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

function fileMap(design: ApiDesign = apiDesign): Map<string, string> {
  return new Map(
    buildFrontendScaffold({ ...input, apiDesign: design }).map((f) => [
      f.path,
      f.content,
    ]),
  );
}

describe('buildFrontendScaffold', () => {
  it('emits a Next.js app shell + a page per module', () => {
    const files = fileMap();
    expect(files.has('app/layout.tsx')).toBe(true);
    expect(files.has('app/page.tsx')).toBe(true);
    expect(files.has('app/users/page.tsx')).toBe(true);
    expect(files.has('app/users/new/page.tsx')).toBe(true);
    expect(files.has('app/users/[id]/page.tsx')).toBe(true);
    expect(() => JSON.parse(files.get('package.json')!)).not.toThrow();
  });

  it('names client functions after the same handlers the backend controller uses', () => {
    const client = fileMap().get('lib/api/users.ts')!;
    expect(client).toContain('export function findAll(');
    expect(client).toContain('export function findOne(');
    expect(client).toContain('export function create(');
    expect(client).toContain('export function update(');
    expect(client).toContain('export function remove(');
    // Paths are relative to API_URL, which already carries the /api prefix.
    expect(client).toContain("apiFetch<UsersItem[]>(`/users${qs(query)}`)");
    expect(client).toContain('apiFetch<UsersItem>(`/users/${param(id)}`)');
    expect(client).toContain("{ method: 'DELETE' }");
  });

  it('types the item from the RICHEST response, with every field optional', () => {
    const client = fileMap().get('lib/api/users.ts')!;
    // The list response (3 fields) wins over the thinner detail response.
    expect(client).toContain('export interface UsersItem {');
    expect(client).toMatch(/id\?: string;/);
    expect(client).toMatch(/email\?: string;/);
    expect(client).toMatch(/isActive\?: boolean;/);
    // Nothing about an item is promised as required — the schema is a design,
    // not a running API.
    const item = client.slice(
      client.indexOf('export interface UsersItem'),
      client.indexOf('export interface FindAllUsersQuery'),
    );
    expect(item).not.toMatch(/^\s+\w+: /m);
  });

  it('keeps server-managed fields out of the request body type and the form', () => {
    const files = fileMap();
    const client = files.get('lib/api/users.ts')!;
    const body = client.slice(client.indexOf('export interface CreateUsersBody'));
    expect(body).toContain('email: string;');
    expect(body).toContain('age?: number;');
    expect(body.slice(0, body.indexOf('}'))).not.toMatch(/\bid\??:/);

    const form = files.get('app/users/new/page.tsx')!;
    expect(form).toContain('useState');
    expect(form).not.toContain('setId(');
  });

  it('unwraps a list defensively — the design never said it was unwrapped', () => {
    const page = fileMap().get('app/users/page.tsx')!;
    expect(page).toContain('Array.isArray(data) ? data : []');
  });

  it('embeds design text as a JSON string, never as raw JSX', () => {
    const hostile: ApiDesign = {
      ...apiDesign,
      modules: [{ ...apiDesign.modules[0], name: 'Users "core" {x}' }],
    };
    const page = fileMap(hostile).get('app/users-core-x/page.tsx')!;
    // Quotes/braces would not compile as JSX text; they must be escaped inside a
    // string expression.
    expect(page).toContain('{"Users \\"core\\" {x}"}');
  });

  it('does not reference a path param it never declared', () => {
    // A tenant-scoped base path: `:tenant` lives in the resource segment, so it
    // is invisible to the module-relative subPath.
    const tenanted: ApiDesign = {
      sessionId: 's',
      generatedAt: 'now',
      modules: [
        {
          name: 'Reports',
          basePath: '/api/:tenant/reports',
          endpoints: [
            {
              method: 'GET',
              path: '/api/:tenant/reports',
              summary: 'Tenant reports',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    };
    const client = fileMap(tenanted).get('lib/api/reports.ts')!;
    expect(client).toContain('export function findAll(tenant: string | number)');
    expect(client).toContain('apiFetch<unknown>(`/${param(tenant)}/reports`)');
  });

  it('invents no UI for a module with no list endpoint', () => {
    const odd: ApiDesign = {
      sessionId: 's',
      generatedAt: 'now',
      modules: [
        {
          name: 'Webhooks',
          basePath: '/api/webhooks',
          endpoints: [
            {
              method: 'POST',
              path: '/api/webhooks/replay',
              summary: 'Replay a webhook',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [202],
            },
          ],
        },
      ],
    };
    const files = fileMap(odd);
    expect(files.has('app/webhooks/page.tsx')).toBe(true);
    expect(files.has('app/webhooks/new/page.tsx')).toBe(false);
    const page = files.get('app/webhooks/page.tsx')!;
    expect(page).toContain('no list endpoint');
  });

  it('produces a deterministic, unique, sorted file set', () => {
    const a = buildFrontendScaffold(input).map((f) => f.path);
    const b = buildFrontendScaffold(input).map((f) => f.path);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect([...a].sort((x, y) => x.localeCompare(y))).toEqual(a);
  });

  it('cannot be made to emit code from a designed path, method, or summary', () => {
    // The design is LLM output derived from the user's own words. If a path can
    // carry a quote or a `${`, it breaks out of the string literal it lands in
    // and the "generated code" is whatever the model wrote.
    const hostile: ApiDesign = {
      sessionId: 's',
      generatedAt: 'now',
      modules: [
        {
          name: 'Evil',
          basePath: "/api/evil'); process.exit(1);//",
          endpoints: [
            {
              method: "GET'); process.exit(1);//" as 'GET',
              path: '/api/evil/`+process.env.AWS_SECRET+`',
              summary: 'Breaks out\nof a line comment */ and a block one',
              requestSchema: [],
              responseSchema: [],
              statusCodes: [200],
            },
          ],
        },
      ],
    };
    const client = fileMap(hostile).get('lib/api/evil.ts')!;

    // Nothing escaped a string literal: no injected statement, and — with no path
    // params in this module — no backtick or `$` anywhere at all.
    expect(client).not.toContain('process.exit');
    expect(client).not.toMatch(/[`$]/);
    // What survives is inert path text, and the request the comment advertises is
    // the request the function actually makes.
    expect(client).toContain(
      "return apiFetch<unknown>('/evil/process.env.AWS_SECRET');",
    );
    expect(client).toContain('/** GET /api/evil/process.env.AWS_SECRET —');
    // An unrecognized method reads as a GET rather than being echoed verbatim.
    expect(client).not.toContain("method: 'GET')");
    // A summary cannot close the block comment early.
    expect(client.match(/\*\//g)?.length).toBe(client.match(/\/\*\*/g)?.length);
  });
});

describe('buildScaffold', () => {
  it('re-roots both halves into one workspace for `fullstack`', () => {
    const files = buildScaffold(input, 'fullstack');
    const paths = files.map((f) => f.path);

    expect(paths).toContain('apps/api/prisma/schema.prisma');
    expect(paths).toContain('apps/api/src/main.ts');
    expect(paths).toContain('apps/web/app/users/page.tsx');
    expect(paths).toContain('apps/web/lib/api-client.ts');

    const root = JSON.parse(
      files.find((f) => f.path === 'package.json')!.content,
    ) as { workspaces: string[]; scripts: Record<string, string> };
    expect(root.workspaces).toEqual(['apps/*']);
    // Addressed by package name, so the scripts survive a move.
    expect(root.scripts['dev:api']).toContain('generated-backend');
    expect(root.scripts['dev:web']).toContain('generated-frontend');
  });

  it('lets the browser actually reach the API it ships with (CORS)', () => {
    const main = buildScaffold(input, 'fullstack').find(
      (f) => f.path === 'apps/api/src/main.ts',
    )!.content;
    expect(main).toContain('app.enableCors(');
    expect(main).toContain('http://localhost:3001');
  });

  it('leaves the single-target builds byte-for-byte unchanged', () => {
    expect(buildScaffold(input, 'backend')).toEqual(
      buildScaffold(input, 'backend'),
    );
    // No re-rooting when only one half is asked for.
    expect(buildScaffold(input, 'backend').map((f) => f.path)).toContain(
      'prisma/schema.prisma',
    );
    expect(buildScaffold(input, 'frontend').map((f) => f.path)).toContain(
      'app/page.tsx',
    );
  });

  it('defaults to the whole app, and coerces junk to the default', () => {
    expect(buildScaffold(input).map((f) => f.path)).toContain(
      'apps/web/app/page.tsx',
    );
    expect(normalizeScaffoldTarget('backend')).toBe('backend');
    expect(normalizeScaffoldTarget('BACKEND')).toBe('backend');
    expect(normalizeScaffoldTarget('nonsense')).toBe('fullstack');
    expect(normalizeScaffoldTarget(undefined)).toBe('fullstack');
  });
});
