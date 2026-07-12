import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * E2E smoke tests for the full pipeline. The whole stack runs offline: with no
 * LLM/billing/mail keys configured the API resolves the mock providers, so
 * every agent falls to its deterministic build and the mock checkout upgrades
 * instantly — the test needs only Postgres + Redis (docker compose up db redis).
 *
 * Locally the config reuses already-running dev servers (ports 3000/3001) and
 * only starts them if absent; in CI it runs the production builds (the workflow
 * builds the API and web apps first).
 */
/**
 * Local runs must never inherit a remote stack from `apps/api/.env` (which may
 * point DATABASE_URL at a hosted Postgres, or carry real LLM/billing/mail
 * keys). Real environment variables always beat `.env` (dotenv never
 * overrides), so pinning these on the spawned server locks the e2e to the
 * documented docker-compose stack + the offline providers. CI provides its own
 * env at the workflow level instead.
 */
const LOCAL_DB_URL = 'postgresql://postgres:postgres@localhost:5433/archivato';
const localApiEnv = {
  PORT: '3001',
  DATABASE_URL: LOCAL_DB_URL,
  DIRECT_URL: LOCAL_DB_URL,
  REDIS_URL: '',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  WEB_ORIGIN: 'http://localhost:3000',
  LLM_PROVIDER: 'mock',
  BILLING_PROVIDER: 'mock',
  MAIL_PROVIDER: 'log',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  // One flow, one worker — the pipeline stages depend on each other.
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // /health/ready 503s until Postgres + Redis respond, so the run cannot
      // start against a half-booted API.
      command: CI
        ? 'npm run start:prod --workspace @archivato/api'
        : 'npm run dev:api',
      url: 'http://localhost:3001/health/ready',
      // Never adopt an already-running API: its .env may point at a remote
      // (even production) database, and the e2e writes users/projects. Failing
      // on a busy port 3001 is the safe outcome — stop `dev:api` first.
      reuseExistingServer: false,
      timeout: 180_000,
      env: CI ? {} : localApiEnv,
    },
    {
      command: CI
        ? 'npm run start --workspace @archivato/web'
        : 'npm run dev:web',
      url: 'http://localhost:3000',
      reuseExistingServer: !CI,
      timeout: 240_000,
    },
  ],
});
