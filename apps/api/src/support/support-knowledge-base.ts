import type { SupportCategory } from '@archivato/shared';

/**
 * The curated **seed** set of Knowledge Base articles.
 *
 * The KB is now a real, editable store (see `kb.service.ts` / `kb.repository.ts`).
 * On first boot the store is empty, so `KbService` seeds it from this set — the
 * AI deflection layer and the public KB keep working out of the box, and staff
 * can then edit/add/remove articles via `support:kb:manage`. Ids are stable so
 * re-seeding is idempotent.
 */
export interface SeedKbArticle {
  id: string;
  title: string;
  body: string;
  category: SupportCategory;
  keywords: string[];
}

export const KB_SEED: readonly SeedKbArticle[] = [
  {
    id: 'kb-groq-key',
    title: 'Enable real AI with a free Groq API key',
    category: 'ai_generation',
    keywords: ['groq', 'api key', 'ai', 'mock', 'real ai', 'llm', 'provider', 'key'],
    body: 'The app runs in offline mock mode with no key. Paste a free Groq key into apps/api/.env as GROQ_API_KEY (leave LLM_PROVIDER unset) and restart the API — the startup log shows the resolved provider. Every agent keeps a deterministic fallback, so generation always yields a valid artifact.',
  },
  {
    id: 'kb-upgrade-pro',
    title: 'Upgrade to Pro to unlock the API design, review, roadmap & export',
    category: 'billing',
    keywords: ['pro', 'upgrade', 'billing', 'payment', 'plan', 'locked', 'api design', 'export', 'review', 'quota', 'project limit'],
    body: 'Free covers the interview, requirements, system design, and database design. The API design and everything after it (AI review, roadmap, cost estimate, export) are Pro. Free also allows 1 project; Pro allows 5. Open the upgrade modal from any locked tab or the quota banner — in mock mode it activates instantly.',
  },
  {
    id: 'kb-project-limit',
    title: 'You have reached your project limit',
    category: 'billing',
    keywords: ['project limit', 'quota', 'cannot create', 'max projects', '402', 'delete project'],
    body: 'Free allows 1 project and Pro allows 5. To start another at the cap, delete an existing project (this frees a slot and cascades all its artifacts) or upgrade to Pro.',
  },
  {
    id: 'kb-generation-stuck',
    title: 'A generation stage is stuck or failed',
    category: 'ai_generation',
    keywords: ['stuck', 'failed', 'generation', 'timeout', 'redis', 'job', 'queue', 'not generating', 'spinner'],
    body: 'Async generation runs on Redis (BullMQ). Ensure `docker compose up -d db redis` is running. If a job times out, retry it — every agent has a deterministic fallback so it will still produce a valid artifact. Check the API logs for the failing stage.',
  },
  {
    id: 'kb-reset-password',
    title: 'Reset or set your password',
    category: 'account',
    keywords: ['password', 'reset', 'forgot', 'login', 'cannot sign in', 'otp', 'code', 'oauth'],
    body: 'Use "Forgot password?" on the login screen to receive a one-time code by email, then set a new password. OAuth-only accounts (Google/GitHub) can set a first password from Settings → Change password (leave current password blank).',
  },
  {
    id: 'kb-verify-email',
    title: 'Verify your email address',
    category: 'account',
    keywords: ['verify', 'email', 'unverified', 'confirmation', 'resend'],
    body: 'After registering, click the link in the verification email. If it did not arrive, use the "Resend" action in the in-app banner. In local/dev the link may be logged to the API console or an Ethereal preview inbox.',
  },
  {
    id: 'kb-export-formats',
    title: 'Export your design (JSON, Markdown, OpenAPI, PDF)',
    category: 'api',
    keywords: ['export', 'download', 'openapi', 'markdown', 'json', 'pdf', 'structure'],
    body: 'From a confirmed project, the Export tab (Pro) offers a JSON bundle, a Markdown report, an OpenAPI 3.0 spec, and a GitHub project structure. PDF is produced via the browser print dialog. You can also direct-export from a project card.',
  },
  {
    id: 'kb-api-error',
    title: 'Troubleshooting API errors (401 / 402 / 409)',
    category: 'api',
    keywords: ['error', '401', '402', '409', 'unauthorized', 'forbidden', 'conflict', 'api', 'request failed'],
    body: '401 means your session expired — the client auto-refreshes; sign in again if it persists. 402 means the feature is Pro (upgrade). 409 means a prerequisite stage has not been generated yet — complete the upstream stage first.',
  },
];
