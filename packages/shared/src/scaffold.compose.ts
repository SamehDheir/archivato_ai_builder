/**
 * Picks the scaffold a caller asked for, and — for `fullstack` — assembles the
 * two builders into one npm-workspaces monorepo (`apps/api` + `apps/web`), the
 * same shape Archivato itself is built in.
 *
 * The two builders stay independent and unaware of each other: composing is a
 * re-rooting of their paths plus the three root files a workspace needs. That's
 * why `backend` and `frontend` remain byte-for-byte what they always were.
 */

import {
  estimateCosts,
  type CostProviderId,
  type ProviderEstimate,
} from './cost-estimate';
import {
  buildBackendScaffold,
  DEFAULT_SCAFFOLD_TARGET,
  FRONTEND_DEV_PORT,
  SCAFFOLD_TARGETS,
  type ScaffoldFile,
  type ScaffoldInput,
  type ScaffoldTarget,
} from './scaffold';
import { buildFrontendScaffold } from './scaffold.frontend';
import { buildDeploymentFiles, hasDeployConfig } from './scaffold.deploy';

/** Package names of the two workspaces (set by each builder's package.json). */
const API_PKG = 'generated-backend';
const WEB_PKG = 'generated-frontend';

/** Coerce untrusted input to a target; anything unrecognized → the default. */
export function normalizeScaffoldTarget(
  value: string | undefined | null,
): ScaffoldTarget {
  const key = (value ?? '').trim().toLowerCase();
  return (SCAFFOLD_TARGETS as readonly string[]).includes(key)
    ? (key as ScaffoldTarget)
    : DEFAULT_SCAFFOLD_TARGET;
}

/**
 * The default deploy target: the best-value provider **that can actually host
 * this app**. Same pure `estimateCosts()` the Cost tab runs, on the same inputs
 * — so the dollar figures behind the choice are the ones the user was shown.
 *
 * Why it isn't simply `estimate.recommended`: the estimator prices all eight
 * providers as if any of them could run the design, and on a small workload the
 * cheapest is often **Cloudflare** — whose compute is Workers, which a long-lived
 * NestJS server does not run on at all — or **AWS**, which needs account-specific
 * infrastructure. Defaulting to either would hand every user a Docker fallback
 * instead of the deploy config this stage exists to produce. So we take the
 * cheapest among the providers we can emit a real, runnable config for.
 *
 * (The estimator recommending an infeasible host is its own bug, in its own
 * stage. This function does not paper over it — it only refuses to inherit it.)
 */
export function recommendedProvider(input: ScaffoldInput): CostProviderId {
  const endpoints = (input.apiDesign?.modules ?? []).reduce(
    (n, m) => n + (m.endpoints?.length ?? 0),
    0,
  );
  const estimate = estimateCosts({
    sessionId: '',
    services: input.systemDesign?.services?.length ?? 0,
    entities: input.databaseDesign?.entities?.length ?? 0,
    endpoints,
    databaseType: input.databaseDesign?.databaseType ?? 'PostgreSQL',
    architecture: input.systemDesign?.architecture ?? 'monolith',
  });

  const monthlyTotal = (p: ProviderEstimate) =>
    p.costs.reduce((sum, c) => sum + c.monthlyUsd, 0);

  const deployable = estimate.providers.filter((p) => hasDeployConfig(p.provider));
  if (!deployable.length) return estimate.recommended;

  return deployable.reduce((best, p) =>
    monthlyTotal(p) < monthlyTotal(best) ? p : best,
  ).provider;
}

/** Build the scaffold for `target` as a flat, sorted list of files. */
export function buildScaffold(
  input: ScaffoldInput,
  target: ScaffoldTarget = DEFAULT_SCAFFOLD_TARGET,
  options: { provider?: CostProviderId } = {},
): ScaffoldFile[] {
  const provider = options.provider ?? recommendedProvider(input);
  // Deployment artifacts are generated HERE, not inside the two builders: only
  // this layer knows the final layout (`apps/api/` vs the repo root), and a
  // Dockerfile has to point at the app it actually builds.
  const deployment = buildDeploymentFiles(input, target, provider);

  const files =
    target === 'fullstack'
      ? [
          ...rootFiles(input),
          ...prefixed(buildBackendScaffold(input), 'apps/api/'),
          ...prefixed(buildFrontendScaffold(input), 'apps/web/'),
          ...deployment,
        ]
      : [
          ...(target === 'backend'
            ? buildBackendScaffold(input)
            : buildFrontendScaffold(input)),
          ...deployment,
        ];

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function prefixed(files: ScaffoldFile[], prefix: string): ScaffoldFile[] {
  return files.map((f) => ({ ...f, path: `${prefix}${f.path}` }));
}

function rootFiles(input: ScaffoldInput): ScaffoldFile[] {
  const pkg = {
    name: 'generated-app',
    version: '0.1.0',
    private: true,
    workspaces: ['apps/*'],
    scripts: {
      // Addressed by package name, not path, so these keep working if the
      // workspaces are ever moved.
      'dev:api': `npm run start:dev --workspace ${API_PKG}`,
      'dev:web': `npm run dev --workspace ${WEB_PKG}`,
      build: `npm run build --workspace ${API_PKG} && npm run build --workspace ${WEB_PKG}`,
      'prisma:migrate': `npm run prisma:migrate --workspace ${API_PKG}`,
    },
  };

  return [
    { path: 'package.json', content: JSON.stringify(pkg, null, 2) + '\n' },
    {
      path: '.gitignore',
      content: ['node_modules/', 'dist/', '.next/', '.env', '.env*.local', ''].join(
        '\n',
      ),
    },
    { path: 'README.md', content: renderReadme(input) },
  ];
}

function renderReadme(input: ScaffoldInput): string {
  const { idea, systemDesign, databaseDesign, apiDesign } = input;
  const entities = databaseDesign?.entities?.length ?? 0;
  const modules = apiDesign?.modules?.length ?? 0;
  const endpoints = (apiDesign?.modules ?? []).reduce(
    (n, m) => n + (m.endpoints?.length ?? 0),
    0,
  );

  return [
    '# Generated App',
    '',
    '> Scaffolded by **Archivato AI Builder** from your system design. A NestJS +',
    '> Prisma API and a Next.js client, wired together in one npm workspace.',
    '',
    '## The idea',
    '',
    (idea ?? '').replace(/\s+/g, ' ').trim(),
    '',
    `**Architecture:** ${systemDesign?.architecture ?? 'monolith'} · **${entities}** tables · **${modules}** API modules · **${endpoints}** endpoints`,
    '',
    '## Layout',
    '',
    '```',
    'apps/api   NestJS + Prisma  →  http://localhost:3000/api',
    `apps/web   Next.js + Tailwind →  http://localhost:${FRONTEND_DEV_PORT}`,
    '```',
    '',
    '## Getting started',
    '',
    '```bash',
    'npm install                       # installs both workspaces',
    '',
    'cp apps/api/.env.example apps/api/.env        # set DATABASE_URL',
    'cp apps/web/.env.example apps/web/.env.local  # points at the API',
    '',
    'npm run prisma:migrate            # create the schema',
    'npm run dev:api                   # terminal 1 — :3000',
    `npm run dev:web                   # terminal 2 — :${FRONTEND_DEV_PORT}`,
    '```',
    '',
    'The API allows the web origin via `WEB_ORIGIN` (CORS), so the two talk to',
    'each other out of the box.',
    '',
    '## What is real, and what is a stub',
    '',
    '| Real | Stub |',
    '| --- | --- |',
    '| Prisma schema, migrations | Service methods (they throw "Not implemented") |',
    '| Routes, DTOs, validation | Business logic, auth |',
    '| Typed API client, CRUD pages | Response types (derived from the design) |',
    '',
    'Each app has its own README with the details.',
    '',
  ].join('\n');
}
