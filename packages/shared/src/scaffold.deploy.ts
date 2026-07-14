/**
 * Deterministic **deployment artifacts** for a generated scaffold — the step that
 * turns the Cost Estimator's recommendation from a planning figure into something
 * you can actually ship. Pure and runtime-free, like the scaffold builders it
 * rides along with: no LLM, stable across runs, unit-testable offline.
 *
 * Every target gets the same base — a Dockerfile per app, a `docker-compose.yml`
 * that stands the whole thing up (app + database) on one machine, and a GitHub
 * Actions workflow — plus a provider config **only where we can emit a real one**.
 *
 * **What we deliberately do NOT emit.** AWS and Cloudflare are priced by the cost
 * estimator but get no provider config here: a real AWS deploy is account-specific
 * infrastructure (VPC/ECS/RDS, a CDK stack), and Cloudflare's compute is Workers,
 * which a long-lived NestJS server does not run on at all. Emitting a CDK stack or
 * a `wrangler.toml` that has never been run would be exactly the confidently-wrong
 * output this codebase refuses everywhere else. They fall back to the Docker path —
 * which genuinely works on both — and `DEPLOY.md` says so plainly.
 *
 * Vercel is the other honest asymmetry: it hosts the **Next.js client** beautifully
 * and cannot host the NestJS server (no long-lived process), so it gets a
 * `vercel.json` for the web app and a pointer for the API. That's the split
 * Archivato itself runs on.
 */

import {
  costProviderName,
  type CostProviderId,
} from './cost-estimate';
import {
  FRONTEND_DEV_PORT,
  type ScaffoldFile,
  type ScaffoldInput,
  type ScaffoldTarget,
} from './scaffold';
import { prismaProvider } from './scaffold.util';

/** Providers we can emit a real, runnable config for (see the file header). */
export const DEPLOY_CONFIGURED: readonly CostProviderId[] = [
  'render',
  'flyio',
  'railway',
  'heroku',
  'digitalocean',
  'vercel',
];

/** Whether a provider gets a config file, or the plain Docker path. */
export function hasDeployConfig(provider: CostProviderId): boolean {
  return DEPLOY_CONFIGURED.includes(provider);
}

/** Where each app sits in the generated repo — `''` means the repo root. */
interface Layout {
  /** Directory of the NestJS app, or null when the target has no backend. */
  api: string | null;
  /** Directory of the Next.js app, or null when the target has no frontend. */
  web: string | null;
  /** Root package name, for provider configs that need one. */
  appName: string;
}

function layoutFor(target: ScaffoldTarget): Layout {
  if (target === 'backend') return { api: '', web: null, appName: 'generated-backend' };
  if (target === 'frontend') return { api: null, web: '', appName: 'generated-frontend' };
  return { api: 'apps/api/', web: 'apps/web/', appName: 'generated-app' };
}

/** The database container for the designed database type, if we can run one. */
interface Db {
  image: string;
  port: number;
  /** DATABASE_URL pointing at the compose service. */
  url: string;
  env: Record<string, string>;
}

/**
 * Only Postgres and MySQL get a compose service. SQLite needs no server, and
 * Mongo/SQL Server would need a schema this scaffold doesn't generate — better to
 * say so in DEPLOY.md than to start a container the app can't use.
 */
function dbFor(databaseType: string): Db | null {
  switch (prismaProvider(databaseType)) {
    case 'postgresql':
      return {
        image: 'postgres:16-alpine',
        port: 5432,
        url: 'postgresql://app:app@db:5432/app?schema=public',
        env: { POSTGRES_USER: 'app', POSTGRES_PASSWORD: 'app', POSTGRES_DB: 'app' },
      };
    case 'mysql':
      return {
        image: 'mysql:8',
        port: 3306,
        url: 'mysql://app:app@db:3306/app',
        env: {
          MYSQL_ROOT_PASSWORD: 'app',
          MYSQL_USER: 'app',
          MYSQL_PASSWORD: 'app',
          MYSQL_DATABASE: 'app',
        },
      };
    default:
      return null;
  }
}

/** Build the deployment artifacts for a scaffold of `target` on `provider`. */
export function buildDeploymentFiles(
  input: ScaffoldInput,
  target: ScaffoldTarget,
  provider: CostProviderId,
): ScaffoldFile[] {
  const layout = layoutFor(target);
  const db = layout.api ? dbFor(input.databaseDesign?.databaseType ?? '') : null;
  const files: ScaffoldFile[] = [];

  if (layout.api !== null) {
    files.push({ path: `${layout.api}Dockerfile`, content: API_DOCKERFILE });
    files.push({ path: `${layout.api}.dockerignore`, content: DOCKERIGNORE });
  }
  if (layout.web !== null) {
    files.push({ path: `${layout.web}Dockerfile`, content: WEB_DOCKERFILE });
    files.push({ path: `${layout.web}.dockerignore`, content: DOCKERIGNORE });
  }

  files.push({ path: 'docker-compose.yml', content: compose(layout, db) });
  files.push({
    path: '.github/workflows/deploy.yml',
    content: workflow(layout, provider),
  });
  files.push(...providerConfig(layout, provider, db));
  files.push({ path: 'DEPLOY.md', content: deployDoc(input, layout, provider, db) });

  return files;
}

// ── Docker ───────────────────────────────────────────────────────────────────

/**
 * `npm install`, not `npm ci`: the scaffold ships no lockfile (it is generated,
 * not installed), and `npm ci` fails without one.
 */
const API_DOCKERFILE = `# Generated by Archivato — the NestJS + Prisma API.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
# Apply migrations, then serve. Drop the migrate step if you deploy schema
# changes separately (safer once you have real data).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
`;

/**
 * `NEXT_PUBLIC_*` is inlined at **build** time, not read at runtime — so the API
 * URL has to be a build arg. Setting it only as a runtime env var is the classic
 * way to ship a client that calls localhost in production.
 */
const WEB_DOCKERFILE = `# Generated by Archivato — the Next.js client.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.js ./
EXPOSE ${FRONTEND_DEV_PORT}
# Honour $PORT: Render, Heroku and friends assign the port and expect the process
# to bind it. Hardcoding one ships a container nothing can reach.
CMD ["sh", "-c", "npx next start -p \${PORT:-${FRONTEND_DEV_PORT}}"]
`;

const DOCKERIGNORE = `node_modules
dist
.next
.env
.env*.local
`;

function compose(layout: Layout, db: Db | null): string {
  const lines: string[] = [
    '# Generated by Archivato — the whole app on one machine.',
    '#   docker compose up --build',
    'services:',
  ];

  if (db) {
    lines.push(
      '  db:',
      `    image: ${db.image}`,
      '    restart: unless-stopped',
      '    environment:',
      ...Object.entries(db.env).map(([k, v]) => `      ${k}: ${v}`),
      '    volumes:',
      '      - db-data:/var/lib/' + (db.image.startsWith('mysql') ? 'mysql' : 'postgresql/data'),
      '    healthcheck:',
      db.image.startsWith('mysql')
        ? '      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]'
        : '      test: ["CMD-SHELL", "pg_isready -U app"]',
      '      interval: 5s',
      '      retries: 10',
      '',
    );
  }

  if (layout.api !== null) {
    lines.push(
      '  api:',
      `    build: ./${layout.api || '.'}`,
      '    restart: unless-stopped',
      '    environment:',
      `      PORT: 3000`,
      // The browser calls the API from the host, so the allowed origin is the
      // host URL — not the compose service name.
      `      WEB_ORIGIN: http://localhost:${FRONTEND_DEV_PORT}`,
      ...(db ? [`      DATABASE_URL: ${db.url}`] : []),
      '    ports:',
      '      - "3000:3000"',
      ...(db
        ? ['    depends_on:', '      db:', '        condition: service_healthy']
        : []),
      '',
    );
  }

  if (layout.web !== null) {
    lines.push(
      '  web:',
      '    build:',
      `      context: ./${layout.web || '.'}`,
      '      args:',
      // Baked in at build time (see WEB_DOCKERFILE) and resolved by the BROWSER,
      // so it must be reachable from the host.
      '        NEXT_PUBLIC_API_URL: http://localhost:3000/api',
      '    restart: unless-stopped',
      '    ports:',
      `      - "${FRONTEND_DEV_PORT}:${FRONTEND_DEV_PORT}"`,
      ...(layout.api !== null ? ['    depends_on:', '      - api'] : []),
      '',
    );
  }

  if (db) lines.push('volumes:', '  db-data:', '');
  return lines.join('\n');
}

// ── GitHub Actions ───────────────────────────────────────────────────────────

/**
 * One workflow: a build gate that always runs, plus a deploy step for the chosen
 * provider. Each deploy step uses that provider's own documented CLI/action and a
 * single repository secret — and the job is skipped when the secret is absent, so
 * a fresh repo is green on push instead of failing on a deploy nobody configured.
 */
function workflow(layout: Layout, provider: CostProviderId): string {
  const head = [
    `# Generated by Archivato — build, then deploy to ${costProviderName(provider)}.`,
    `name: deploy`,
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  workflow_dispatch:',
    '',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    `          node-version: '20'`,
    ...(layout.api !== null
      ? [
          `      - name: Build API`,
          `        working-directory: ${layout.api || '.'}`,
          '        run: |',
          '          npm install',
          '          npx prisma generate',
          '          npm run build',
        ]
      : []),
    ...(layout.web !== null
      ? [
          `      - name: Build web`,
          `        working-directory: ${layout.web || '.'}`,
          '        run: |',
          '          npm install',
          '          npm run build',
        ]
      : []),
    '',
    '  deploy:',
    '    needs: build',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
  ];

  return [...head, ...deployStep(layout, provider), ''].join('\n');
}

function deployStep(layout: Layout, provider: CostProviderId): string[] {
  switch (provider) {
    case 'render':
      // Render deploys from the repo itself; the hook just tells it to start.
      return [
        '      - name: Trigger Render deploy',
        '        if: ${{ secrets.RENDER_DEPLOY_HOOK != \'\' }}',
        '        run: curl -fsS -X POST "$RENDER_DEPLOY_HOOK"',
        '        env:',
        '          RENDER_DEPLOY_HOOK: ${{ secrets.RENDER_DEPLOY_HOOK }}',
      ];
    case 'flyio':
      return [
        '      - uses: superfly/flyctl-actions/setup-flyctl@master',
        ...(layout.api !== null
          ? [
              '      - name: Deploy API',
              '        if: ${{ secrets.FLY_API_TOKEN != \'\' }}',
              `        run: flyctl deploy --remote-only --config ${layout.api}fly.toml`,
              '        env:',
              '          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}',
            ]
          : []),
        ...(layout.web !== null
          ? [
              '      - name: Deploy web',
              '        if: ${{ secrets.FLY_API_TOKEN != \'\' }}',
              `        run: flyctl deploy --remote-only --config ${layout.web}fly.toml`,
              '        env:',
              '          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}',
            ]
          : []),
      ];
    case 'railway':
      return [
        '      - name: Deploy to Railway',
        '        if: ${{ secrets.RAILWAY_TOKEN != \'\' }}',
        '        run: |',
        '          npm i -g @railway/cli',
        '          railway up --service ${{ vars.RAILWAY_SERVICE }}',
        '        env:',
        '          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}',
      ];
    case 'heroku':
      return [
        '      - name: Deploy container to Heroku',
        '        if: ${{ secrets.HEROKU_API_KEY != \'\' }}',
        '        run: |',
        '          heroku container:login',
        '          heroku container:push web --app "$HEROKU_APP"',
        '          heroku container:release web --app "$HEROKU_APP"',
        '        env:',
        '          HEROKU_API_KEY: ${{ secrets.HEROKU_API_KEY }}',
        '          HEROKU_APP: ${{ vars.HEROKU_APP }}',
      ];
    case 'digitalocean':
      return [
        '      - uses: digitalocean/action-doctl@v2',
        '        if: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN != \'\' }}',
        '        with:',
        '          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}',
        '      - name: Deploy App Platform',
        '        if: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN != \'\' }}',
        '        run: doctl apps create-deployment "${{ vars.DO_APP_ID }}" --wait',
      ];
    case 'vercel':
      return [
        '      - name: Deploy web to Vercel',
        '        if: ${{ secrets.VERCEL_TOKEN != \'\' }}',
        `        working-directory: ${layout.web ?? '.'}`,
        '        run: npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"',
        '        env:',
        '          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
        ...(layout.api !== null
          ? [
              '      # Vercel cannot host the NestJS server (no long-lived process).',
              '      # Deploy the API to a container host — see DEPLOY.md.',
            ]
          : []),
      ];
    default:
      // aws / cloudflare: no provider config to deploy, so publish the images and
      // let the (account-specific) infrastructure pull them.
      return [
        '      - uses: docker/login-action@v3',
        '        with:',
        '          registry: ghcr.io',
        '          username: ${{ github.actor }}',
        '          password: ${{ secrets.GITHUB_TOKEN }}',
        ...(layout.api !== null
          ? [
              '      - name: Build & push API image',
              '        uses: docker/build-push-action@v6',
              '        with:',
              `          context: ./${layout.api || '.'}`,
              '          push: true',
              '          tags: ghcr.io/${{ github.repository }}-api:latest',
            ]
          : []),
        ...(layout.web !== null
          ? [
              '      - name: Build & push web image',
              '        uses: docker/build-push-action@v6',
              '        with:',
              `          context: ./${layout.web || '.'}`,
              '          push: true',
              '          tags: ghcr.io/${{ github.repository }}-web:latest',
            ]
          : []),
      ];
  }
}

// ── Provider configs ─────────────────────────────────────────────────────────

function providerConfig(
  layout: Layout,
  provider: CostProviderId,
  db: Db | null,
): ScaffoldFile[] {
  switch (provider) {
    case 'render':
      return [{ path: 'render.yaml', content: renderYaml(layout, db) }];
    case 'flyio':
      return [
        ...(layout.api !== null
          ? [{ path: `${layout.api}fly.toml`, content: flyToml('api', 3000) }]
          : []),
        ...(layout.web !== null
          ? [
              {
                path: `${layout.web}fly.toml`,
                content: flyToml('web', FRONTEND_DEV_PORT),
              },
            ]
          : []),
      ];
    case 'railway':
      return [
        ...(layout.api !== null
          ? [{ path: `${layout.api}railway.json`, content: railwayJson() }]
          : []),
        ...(layout.web !== null
          ? [{ path: `${layout.web}railway.json`, content: railwayJson() }]
          : []),
      ];
    case 'heroku':
      return [
        ...(layout.api !== null
          ? [
              {
                path: `${layout.api}Procfile`,
                content: 'release: npx prisma migrate deploy\nweb: node dist/main.js\n',
              },
            ]
          : []),
        ...(layout.web !== null
          ? [{ path: `${layout.web}Procfile`, content: 'web: npm run start\n' }]
          : []),
        { path: 'app.json', content: herokuAppJson(layout, db) },
      ];
    case 'digitalocean':
      return [{ path: '.do/app.yaml', content: doAppYaml(layout, db) }];
    case 'vercel':
      // Vercel hosts the Next client only — the API needs a container host.
      return layout.web !== null
        ? [{ path: `${layout.web}vercel.json`, content: vercelJson() }]
        : [];
    default:
      return []; // aws / cloudflare — Docker path only (see the file header).
  }
}

function renderYaml(layout: Layout, db: Db | null): string {
  const lines = ['# Render blueprint — https://render.com/docs/blueprint-spec', 'services:'];

  if (layout.api !== null) {
    lines.push(
      '  - type: web',
      '    name: api',
      '    runtime: docker',
      `    dockerfilePath: ./${layout.api}Dockerfile`,
      `    dockerContext: ./${layout.api || '.'}`,
      '    healthCheckPath: /api/health',
      '    envVars:',
      '      - key: PORT',
      '        value: 3000',
      ...(db
        ? [
            '      - key: DATABASE_URL',
            '        fromDatabase:',
            '          name: app-db',
            '          property: connectionString',
          ]
        : []),
      ...(layout.web !== null
        ? [
            // NOT `fromService: property: host` — that yields a bare hostname
            // ("web-x.onrender.com"), and CORS compares against a full origin, so
            // every browser request would be blocked. Set it with the scheme.
            '      - key: WEB_ORIGIN',
            '        sync: false # set to https://<your-web>.onrender.com',
          ]
        : []),
    );
  }

  if (layout.web !== null) {
    lines.push(
      '  - type: web',
      '    name: web',
      '    runtime: docker',
      `    dockerfilePath: ./${layout.web}Dockerfile`,
      `    dockerContext: ./${layout.web || '.'}`,
      '    envVars:',
      '      - key: NEXT_PUBLIC_API_URL',
      '        sync: false # set to https://<your-api>.onrender.com/api',
    );
  }

  // Only Postgres has a managed Render database.
  if (db && db.image.startsWith('postgres')) {
    lines.push('', 'databases:', '  - name: app-db', '    plan: free');
  }

  return lines.join('\n') + '\n';
}

function flyToml(app: string, port: number): string {
  return [
    `# Fly.io — run \`fly launch --no-deploy\` once to claim the app name.`,
    `app = "generated-${app}"`,
    'primary_region = "iad"',
    '',
    '[build]',
    '  dockerfile = "Dockerfile"',
    '',
    '[http_service]',
    `  internal_port = ${port}`,
    '  force_https = true',
    '  auto_stop_machines = true',
    '  auto_start_machines = true',
    '  min_machines_running = 0',
    '',
  ].join('\n');
}

function railwayJson(): string {
  return (
    JSON.stringify(
      {
        $schema: 'https://railway.app/railway.schema.json',
        build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
        deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
      },
      null,
      2,
    ) + '\n'
  );
}

function herokuAppJson(layout: Layout, db: Db | null): string {
  return (
    JSON.stringify(
      {
        name: layout.appName,
        description: 'Generated by Archivato AI Builder',
        stack: 'container',
        ...(db && db.image.startsWith('postgres')
          ? { addons: ['heroku-postgresql:essential-0'] }
          : {}),
        env: {
          ...(layout.api !== null
            ? { WEB_ORIGIN: { description: 'Origin allowed to call the API' } }
            : {}),
          ...(layout.web !== null
            ? { NEXT_PUBLIC_API_URL: { description: 'Base URL of the API, incl. /api' } }
            : {}),
        },
      },
      null,
      2,
    ) + '\n'
  );
}

function doAppYaml(layout: Layout, db: Db | null): string {
  const lines = ['# DigitalOcean App Platform — doctl apps create --spec .do/app.yaml', `name: ${layout.appName}`];

  if (layout.api !== null) {
    lines.push(
      'services:',
      '  - name: api',
      `    dockerfile_path: ${layout.api}Dockerfile`,
      `    source_dir: /${layout.api}`,
      '    http_port: 3000',
      '    instance_size_slug: basic-xxs',
      '    instance_count: 1',
      ...(db
        ? [
            '    envs:',
            '      - key: DATABASE_URL',
            '        scope: RUN_TIME',
            '        value: ${app-db.DATABASE_URL}',
          ]
        : []),
    );
  }

  if (layout.web !== null) {
    lines.push(
      ...(layout.api === null ? ['services:'] : []),
      '  - name: web',
      `    dockerfile_path: ${layout.web}Dockerfile`,
      `    source_dir: /${layout.web}`,
      `    http_port: ${FRONTEND_DEV_PORT}`,
      '    instance_size_slug: basic-xxs',
      '    instance_count: 1',
    );
  }

  if (db && db.image.startsWith('postgres')) {
    lines.push('databases:', '  - name: app-db', '    engine: PG', '    production: false');
  }

  return lines.join('\n') + '\n';
}

function vercelJson(): string {
  return (
    JSON.stringify(
      {
        $schema: 'https://openapi.vercel.sh/vercel.json',
        framework: 'nextjs',
        buildCommand: 'npm run build',
        // NEXT_PUBLIC_* is inlined at build time — set it in the Vercel project,
        // not at runtime, or the client will call the wrong host.
        env: { NEXT_PUBLIC_API_URL: '@next_public_api_url' },
      },
      null,
      2,
    ) + '\n'
  );
}

// ── DEPLOY.md ────────────────────────────────────────────────────────────────

function deployDoc(
  input: ScaffoldInput,
  layout: Layout,
  provider: CostProviderId,
  db: Db | null,
): string {
  const name = costProviderName(provider);
  const configured = hasDeployConfig(provider);

  const lines = [
    '# Deploying this app',
    '',
    `**Provider: ${name}** — the best value, by Archivato's cost estimator, among the`,
    'providers this app can actually be hosted on. Everything below is a starting',
    'point: review it, set your own secrets, and check the bill before you scale.',
    '',
    '## Run it locally first',
    '',
    '```bash',
    'docker compose up --build',
    '```',
    '',
    ...(layout.api !== null ? ['- API  → http://localhost:3000/api'] : []),
    ...(layout.web !== null ? [`- Web  → http://localhost:${FRONTEND_DEV_PORT}`] : []),
    '',
  ];

  if (!db && layout.api !== null) {
    lines.push(
      `> **No database container.** The design specifies \`${input.databaseDesign?.databaseType ?? 'an unsupported database'}\`,`,
      '> which this scaffold does not stand up in compose. Point `DATABASE_URL` at your',
      '> own instance.',
      '',
    );
  }

  lines.push(`## Deploying to ${name}`, '');

  if (configured) {
    lines.push(...providerSteps(layout, provider), '');
  } else {
    lines.push(
      `${name} is priced by the estimator but ships **no config file here — on purpose**.`,
      'A real deploy there is account-specific infrastructure' +
        (provider === 'cloudflare'
          ? " (and Cloudflare's compute is Workers, which a long-lived NestJS server does not run on)"
          : ' (VPC / container service / managed database, usually as a CDK or Terraform stack)') +
        ',',
      'and a template that has never been run is worse than none.',
      '',
      'What you get instead is the Docker path, which works there today:',
      '',
      '1. The included workflow builds both images and pushes them to **GHCR**.',
      `2. Point your ${name} service at those images (or run \`docker compose up\` on any VM).`,
      '',
      'Switch the provider in Archivato to get a first-class config for one of:',
      `${DEPLOY_CONFIGURED.map((p) => costProviderName(p)).join(', ')}.`,
      '',
    );
  }

  lines.push(
    '## The one thing that catches everyone',
    '',
    '`NEXT_PUBLIC_API_URL` is **baked into the client at build time**, not read at',
    'runtime. Setting it only as a runtime variable ships a production client that',
    'still calls `localhost`. Set it as a build arg / build-time env var.',
    '',
    'And set `WEB_ORIGIN` on the API to your deployed web origin, or the browser will',
    'block every request (CORS).',
    '',
  );

  return lines.join('\n');
}

function providerSteps(layout: Layout, provider: CostProviderId): string[] {
  switch (provider) {
    case 'render':
      return [
        '`render.yaml` is a Blueprint: **New → Blueprint** in the Render dashboard,',
        'point it at this repo, and it creates the services'
          + (layout.api !== null ? ' and a managed Postgres' : '') + '.',
        '',
        'Then, for continuous deploys, add a **Deploy Hook** URL as the repository',
        'secret `RENDER_DEPLOY_HOOK`.',
      ];
    case 'flyio':
      return [
        '```bash',
        ...(layout.api !== null
          ? [`fly launch --no-deploy --config ${layout.api}fly.toml   # claim the name`]
          : []),
        ...(layout.api !== null ? ['fly postgres create && fly postgres attach   # sets DATABASE_URL'] : []),
        'fly deploy',
        '```',
        '',
        'For CI, add `FLY_API_TOKEN` (`fly tokens create deploy`) as a repository secret.',
      ];
    case 'railway':
      return [
        'Create a project from this repo in Railway; it reads `railway.json` and builds',
        'the Dockerfile. Add a **Postgres** plugin and Railway injects `DATABASE_URL`.',
        '',
        'For CI, add `RAILWAY_TOKEN` (secret) and `RAILWAY_SERVICE` (variable).',
      ];
    case 'heroku':
      return [
        '```bash',
        'heroku create --stack container',
        'heroku addons:create heroku-postgresql:essential-0',
        'git push heroku main',
        '```',
        '',
        'For CI, add `HEROKU_API_KEY` (secret) and `HEROKU_APP` (variable).',
      ];
    case 'digitalocean':
      return [
        '```bash',
        'doctl apps create --spec .do/app.yaml',
        '```',
        '',
        'For CI, add `DIGITALOCEAN_ACCESS_TOKEN` (secret) and `DO_APP_ID` (variable).',
      ];
    case 'vercel':
      return [
        ...(layout.web !== null
          ? [
              `Import \`${layout.web || '.'}\` as a Vercel project (it reads \`vercel.json\`), and set`,
              '`NEXT_PUBLIC_API_URL` in the project\'s **build** environment.',
              '',
            ]
          : []),
        ...(layout.api !== null
          ? [
              '> **Vercel cannot host the NestJS API** — it has no long-lived server process.',
              '> Deploy the API to a container host (Render, Fly.io, Railway, or any VM with',
              '> the included `docker-compose.yml`) and point `NEXT_PUBLIC_API_URL` at it.',
              '> That split — Next on Vercel, Nest in a container — is what Archivato itself runs.',
            ]
          : []),
      ];
    default:
      return [];
  }
}
