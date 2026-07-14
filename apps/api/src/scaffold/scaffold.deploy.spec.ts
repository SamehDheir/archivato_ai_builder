import {
  buildScaffold,
  DEPLOY_CONFIGURED,
  hasDeployConfig,
  recommendedProvider,
  type ApiDesign,
  type CostProviderId,
  type DatabaseDesign,
  type ScaffoldInput,
  type ScaffoldTarget,
  type SystemDesign,
} from '@archivato/shared';

const systemDesign = {
  architecture: 'modular_monolith',
  services: [{ name: 'Auth' }, { name: 'Tasks' }],
} as SystemDesign;

const databaseDesign: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: 'now',
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: '',
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
          requestSchema: [],
          responseSchema: [],
          statusCodes: [200],
        },
      ],
    },
  ],
};

const input: ScaffoldInput = {
  idea: 'A task app',
  systemDesign,
  databaseDesign,
  apiDesign,
};

const fileMap = (target: ScaffoldTarget, provider: CostProviderId) =>
  new Map(buildScaffold(input, target, { provider }).map((f) => [f.path, f.content]));

describe('deployment artifacts', () => {
  it('ships the Docker base for every provider and target', () => {
    for (const provider of [...DEPLOY_CONFIGURED, 'aws', 'cloudflare'] as CostProviderId[]) {
      const files = fileMap('fullstack', provider);
      expect(files.has('docker-compose.yml')).toBe(true);
      expect(files.has('.github/workflows/deploy.yml')).toBe(true);
      expect(files.has('DEPLOY.md')).toBe(true);
      expect(files.has('apps/api/Dockerfile')).toBe(true);
      expect(files.has('apps/web/Dockerfile')).toBe(true);
    }
  });

  it('emits a provider config only where we have a real one', () => {
    expect(fileMap('fullstack', 'render').has('render.yaml')).toBe(true);
    expect(fileMap('fullstack', 'flyio').has('apps/api/fly.toml')).toBe(true);
    expect(fileMap('fullstack', 'digitalocean').has('.do/app.yaml')).toBe(true);
    expect(fileMap('fullstack', 'heroku').has('app.json')).toBe(true);
    expect(fileMap('fullstack', 'railway').has('apps/api/railway.json')).toBe(true);

    // AWS and Cloudflare deliberately ship NO config — a CDK stack or a
    // wrangler.toml that has never been run is worse than the honest Docker path.
    for (const provider of ['aws', 'cloudflare'] as CostProviderId[]) {
      const paths = [...fileMap('fullstack', provider).keys()];
      expect(paths.filter((p) => /render\.yaml|fly\.toml|app\.yaml|wrangler|cdk/.test(p)))
        .toHaveLength(0);
      expect(hasDeployConfig(provider)).toBe(false);
      // …and DEPLOY.md says so, rather than leaving the user to discover it.
      expect(fileMap('fullstack', provider).get('DEPLOY.md')).toContain(
        'on purpose',
      );
    }
  });

  it('defaults to the cheapest provider the app can actually be hosted on', () => {
    // The estimator prices Cloudflare (Workers) and AWS as best value on small
    // workloads — but a long-lived NestJS server cannot run on Workers at all, and
    // AWS needs account-specific infra. Inheriting that recommendation would hand
    // every user the Docker fallback instead of the deploy config this stage exists
    // to produce.
    const provider = recommendedProvider(input);
    expect(DEPLOY_CONFIGURED).toContain(provider);
    expect(hasDeployConfig(provider)).toBe(true);
  });

  it('vercel takes the web app and says plainly that it cannot host the API', () => {
    const files = fileMap('fullstack', 'vercel');
    expect(files.has('apps/web/vercel.json')).toBe(true);
    expect(files.get('DEPLOY.md')).toContain('cannot host the NestJS API');
  });

  it('binds $PORT rather than a hardcoded one (Render/Heroku assign it)', () => {
    // A container that listens on a fixed port when the host assigned a different
    // one is a container nothing can reach.
    expect(fileMap('fullstack', 'render').get('apps/web/Dockerfile')).toContain(
      '${PORT:-3001}',
    );
  });

  it('points the health check at a route that exists', () => {
    const files = fileMap('fullstack', 'render');
    // A health check aimed at a 404 marks a perfectly good deploy unhealthy forever.
    expect(files.get('render.yaml')).toContain('healthCheckPath: /api/health');
    expect(files.get('apps/api/src/health.controller.ts')).toContain(
      "@Controller('health')",
    );
  });

  it('runs a database container matching the designed database', () => {
    const compose = fileMap('fullstack', 'render').get('docker-compose.yml')!;
    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('postgresql://app:app@db:5432/app');

    const mysql = new Map(
      buildScaffold(
        { ...input, databaseDesign: { ...databaseDesign, databaseType: 'MySQL' } },
        'fullstack',
        { provider: 'render' },
      ).map((f) => [f.path, f.content]),
    );
    expect(mysql.get('docker-compose.yml')).toContain('mysql:8');
    expect(mysql.get('docker-compose.yml')).toContain('mysql://app:app@db:3306');
  });

  it('roots the Dockerfiles at the app they build, per target', () => {
    expect(fileMap('backend', 'render').has('Dockerfile')).toBe(true);
    expect(fileMap('frontend', 'render').has('Dockerfile')).toBe(true);
    // A frontend-only scaffold has no API and needs no database.
    const compose = fileMap('frontend', 'render').get('docker-compose.yml')!;
    expect(compose).not.toContain('postgres');
    expect(compose).not.toContain('  api:');
  });
});
