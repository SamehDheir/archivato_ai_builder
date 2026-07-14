# Archivato AI Builder — Project Memory

## What We're Building

An AI SaaS that turns a business idea into a complete software system design.
NOT a chatbot — it's an **AI Software Architecture Generator**.

Pipeline: `Idea → Interview → Requirements → System Design → DB Design →
API Design → Review → Export`. Review is a multi-dimension **AI Architect
Review** (overall + per-dimension scores for security/scalability/performance/
cost, findings per category, critical-issues callout). Three standalone
artifacts hang off the confirmed session: **Product Vision** (PM view of the
interview), **Roadmap** (phased implementation plan from the full design), and
**Cost Estimator** (deterministic per-provider monthly hosting bill at 100/1k/10k
users). Plus post-generation **chat refine**, **version history**,
**diagrams/canvas**, **auth**.

## Tech Stack

- **Backend:** NestJS + TypeScript (`apps/api`)
- **Frontend:** Next.js 14 App Router + Tailwind + shadcn/ui (`apps/web`)
- **DB:** PostgreSQL + Prisma · **Queue:** BullMQ + Redis
- **Shared types:** `packages/shared` (`@archivato/shared`, runtime-free)
- **AI:** provider behind an interface (mock / Claude / Groq)
- **Monorepo:** npm workspaces (`apps/*` + `packages/*`)

## Commands

```bash
# Dev (run both)
npm run dev:api            # NestJS on :3001
npm run dev:web            # Next.js on :3000

# Build (shared → api → web) / test
npm run build
npm run test:api                                     # api Jest (node)
npm run test --workspace @archivato/api -- <file>    # single api test
npm run test:web                                     # web Jest (jsdom + Testing Library)
npm run test --workspace @archivato/web -- <file>    # single web test

# Lint
npm run lint --workspace @archivato/api    # eslint src/**/*.ts
npm run lint --workspace @archivato/web    # next lint (eslint-config-next)

# Prisma (from apps/api)
npm run prisma:migrate --workspace @archivato/api    # migrate dev
npm run prisma:deploy  --workspace @archivato/api    # apply in prod
```

**Run prereq:** `docker compose up -d db redis`, then `prisma:migrate`, before
`dev:api`. Redis is required for `/jobs` (async generation + snapshots).
Compose maps **Postgres to host port 5433** (not 5432, to avoid clashing with a
local Postgres) and Redis to 6379; `DATABASE_URL` in `apps/api/.env` must match.

**API surface:** the NestJS app runs on **:3001** under a global **`/api`** prefix
(`main.ts` `setGlobalPrefix('api')`) — every route is `http://localhost:3001/api/...`.
`main.ts` also sets `rawBody: true` (Paddle webhook HMAC) + a global
`ValidationPipe`; CORS is locked to `WEB_ORIGIN` with credentials.

**Boot-time env validation.** `ConfigModule.forRoot({ validate })` runs
`config/env.validation.ts` on startup and **aborts the boot** on an insecure
config. Checks (most fire only when `NODE_ENV=production`, so dev/tests stay
zero-config): `JWT_ACCESS_SECRET` must be present, not a known dev default, and
≥ 32 chars (the signing/verifying code still carries a `dev-insecure-secret`
fallback for local runs — the guard is what makes that fallback impossible in
prod, closing the token-forgery hole); and `COOKIE_SAMESITE=none` requires Secure
cookies (any env). Prod auto-secures cookies (`NODE_ENV==='production'` in
`auth-cookies.ts`).

**Rate limiting.** `@nestjs/throttler` runs as a **global `APP_GUARD`** (registered
in `app.module.ts`) with a generous default (**300 req/min per IP**) as an app-wide
safety net. Sensitive routes tighten it with `@Throttle(...)` using presets from
`common/throttling.ts`: **auth** login/register (10/min), **email-sending** forgot/
reset/resend (5/15min), **waitlist** (5/min), and **AI/paid-LLM** routes — support
`ai/deflect`·`analyze`·`copilot` and `POST /jobs/:sessionId/:stage` (15/min). The
Paddle **webhook is `@SkipThrottle()`** (Paddle must never be rejected). Throttling
keys off the client IP, so behind a proxy set **`TRUST_PROXY`** (`main.ts` applies it
to Express `trust proxy`) or every request shares the proxy's IP / one bucket.

**Health, errors, deploy.** `HealthModule` exposes probes **excluded from the
`/api` prefix** (root-level, `@SkipThrottle()`): `GET /health` (liveness — process
up) and `GET /health/ready` (readiness — `HealthService` pings Postgres via
`$queryRaw` + Redis via a short-lived non-retrying `ioredis` client; **503** if
either is down). A global **`AllExceptionsFilter`** (`APP_FILTER`) preserves known
`HttpException` bodies but returns a generic 500 for everything else (never leaks
stacks), logs 5xx with request context, and calls `Sentry.captureException` —
a **no-op unless `SENTRY_DSN`** is set (`main.ts` inits Sentry only then). Deploy:
multi-stage **Dockerfiles** for api + web (build from **repo root** for the
workspace; web uses Next **`output:'standalone'`** + `outputFileTracingRoot`),
`docker-compose.prod.yml` (db+redis+api+web with healthchecks), `scripts/backup-db.sh`
(pg_dump + retention), all documented in **`DEPLOY.md`**.

**Managed deploy (Render + Vercel + Supabase + Upstash).** A **`render.yaml`** blueprint
(API) + **`vercel.json`** (web, builds `@archivato/shared` before Next). Three code
seams make it work: (1) **`common/redis.config.ts`** — one `redisConnectionOptions()`
shared by BullMQ and the health probe; a managed **`REDIS_URL`** (`rediss://` ⇒ TLS +
credentials) **wins over** `REDIS_HOST`/`REDIS_PORT` (a bare host/port can't
authenticate to Upstash/Render KV), with host/port kept as the zero-config local
fallback. (2) **`schema.prisma` gained `directUrl`** — Supabase runs the app on the
**transaction pooler** (6543, `?pgbouncer=true&connection_limit=1`) but pgBouncer can't
run DDL, so `prisma migrate` needs the **direct** 5432 URL; `DIRECT_URL` is therefore
**required** (locally just copy `DATABASE_URL`). (3) `next.config.js` only sets
`output:'standalone'` **off Vercel** (`process.env.VERCEL`) — that mode is for the Docker
image. Two traps, both documented in DEPLOY.md: `*.vercel.app` + `*.onrender.com` are
**different sites**, so the auth cookies are third-party (`COOKIE_SAMESITE=none`+Secure,
which **Safari/Brave block** → move to a custom domain like `example.com` +
`api.example.com` to get `lax` back); and Render's **free instance sleeps** (~50s cold
start). Render also needs `TRUST_PROXY=true` (else one rate-limit bucket) and
`GEOIP_FALLBACK=false` (geoip-lite's ~150 MB DB won't fit in 512 MB, and Render sets no
country header — put Cloudflare in front to restore `CF-IPCountry`).

**Docker build gotchas (all three bit us on Render — don't regress them).**
1. **Build context must be the repo root.** `apps/api/Dockerfile` is a *monorepo*
   Dockerfile (it copies `package-lock.json`, `packages/shared/`, `apps/api/`), so
   `render.yaml` pins **`dockerContext: .`** + `dockerfilePath: ./apps/api/Dockerfile`.
   A hand-made Render service with **Root Directory = `apps/api`** scopes the context to
   that folder and every COPY dies with `"/package-lock.json": not found`. Same rule on
   Vercel: keep Root Directory at the repo root and let `vercel.json` drive the build.
2. **`COPY tsconfig.base.json ./` is mandatory.** `packages/shared/tsconfig.json` and
   `apps/api/tsconfig.json` both `extends "../../tsconfig.base.json"`, and that root file
   is what sets **`target: ES2022`**. Omit it and `tsc` can't read it, silently falls back
   to the **ES5** default, and the build dies on one `TS5083: Cannot read file
   '/app/tsconfig.base.json'` followed by ~8 *misleading* `TS2802: … can only be iterated
   through when using '--downlevelIteration'`. The TS2802s are a **symptom** — never
   "fix" them by editing the source or adding `downlevelIteration`.
3. **`npm ci --omit=optional`.** `geoip-lite` is the only optional dep and it's a
   **154 MB** MaxMind DB fetched in a postinstall — it dominates build time and image
   size and can't fit a 512 MB instance anyway. `common/geo.ts` lazily `require`s it in a
   try/catch, so omitting it degrades cleanly to header-only geo (same as
   `GEOIP_FALLBACK=false`).

The **web** Dockerfile needs none of (2)/(3): `apps/web/tsconfig.json` is standalone (no
`extends`) and maps `@archivato/shared` to its **source**, so Next never reads the root
tsconfig and never needs shared's `dist`.

**Render and Vercel want OPPOSITE roots — don't copy one's setting to the other.**
- **Render (Docker):** build context = **repo root** (the Dockerfile copies the whole
  workspace). Root Directory must be **empty**.
- **Vercel (Next):** Root Directory = **`apps/web`**. Vercel's framework detection reads
  the `package.json` *in the Root Directory* and needs `next` in it — the repo root is a
  **workspace root** and has no `next`, so pointing Vercel at the root fails the build with
  `Error: No Next.js version detected`. Vercel still auto-detects the npm workspace and
  installs from the root lockfile, and **`vercel.json` therefore lives at
  `apps/web/vercel.json`** (Vercel reads it from the Root Directory, not the repo root).

## Architecture

- **Modular monolith.** Each pipeline stage is its own Nest module
  (`interview`, `requirements`, `system-design`, `database-design`,
  `api-design`, `review`, `product-vision`, `roadmap`, `cost-estimate`,
  `threat-model`, `qa-plan`, `export`, `share`, `chat`, `jobs`, `stream`, `versions`, `diagrams`, `auth`,
  `billing`, `analytics`, `admin`, `support`, `notifications`, `roles`,
  `waitlist`).
  Modules export their repository token + service for downstream use.
- **Standalone stages** generate from the session but don't gate, and aren't
  gated by, the design chain; each has its own artifact table + owner-guarded
  controller and is not in version snapshots. `product-vision` needs only the
  confirmed interview; `roadmap` and `cost-estimate` need the full pipeline
  (import the upstream design stores, 409 until the API design exists).
- **Cost Estimator (`cost-estimate`).** A standalone, Pro-only stage that
  projects a **ballpark monthly hosting bill** across 8 providers (AWS,
  DigitalOcean, Railway, Render, Vercel, Cloudflare, Fly.io, Heroku) at 100 /
  1,000 / 10,000 users. The dollar figures are **fully deterministic** — no LLM:
  `estimateCosts()` in `@archivato/shared` (`cost-estimate.ts`, runtime-free)
  derives a workload from the design (services→compute units, entities→managed-DB
  tier + storage, user scale→requests/egress) and maps it onto per-provider list
  prices, returning a per-scale breakdown, the cheapest provider per scale, and a
  best-value recommendation. Stable across runs (unit-testable, offline). The
  service only reads system/database/API designs; the estimate is a labeled
  planning figure, not a quote.
- **Threat model (`threat-model`).** A standalone **Pro** stage: a **STRIDE**
  security analysis of the generated design (Spoofing/Tampering/Repudiation/Info
  Disclosure/DoS/Elevation of Privilege), each threat with a component, severity,
  and mitigation, plus trust boundaries + assumptions. **LLM + deterministic
  fallback** (`ThreatModelerAgent`, like `reviewer`): the fallback derives threats
  from design signals (auth+rate-limit, permission-less roles → broken access
  control, `:id` routes → IDOR, sensitive entities without encryption, missing
  queue/cache) and guarantees every STRIDE category is represented (the LLM path's
  `normalize()` backfills any skipped category). Full-pipeline gate (409 until the
  API design exists), owner-guarded + `ProGuard` + `THROTTLE_AI`, own
  `threat_models` table — **not** in version snapshots (like roadmap/cost).
  Mirrors the `roadmap` module structure. Web: a **Security** tab
  (`ThreatModelPanel`/`ThreatModelView`) grouping threats by STRIDE category with a
  severity tally; i18n `stages.threat.*` + `project.tab.threat` (EN+AR). Shared:
  `threat-model.ts` (`STRIDE_CATEGORIES`, reuses `Severity` from `review`).
- **Test/QA plan (`qa-plan`).** A standalone **Pro** stage: a structured testing
  plan — strategy + suites of concrete `TC-n` cases grouped by `TestType`
  (unit/integration/e2e/security/performance/acceptance) + coverage goals /
  tooling / out-of-scope. **LLM + deterministic fallback** (`QaPlannerAgent`): the
  fallback maps services→unit, API modules→integration, flows→e2e, roles/authz→
  security, list endpoints→performance, functional reqs→acceptance, with a shared
  sequential id counter. Same module shape + gating as `threat-model`
  (`ProGuard` + `THROTTLE_AI`, full-pipeline 409, own `qa_plans` table, not in
  snapshots). Web: a **QA Plan** tab (`QaPlanPanel`/`QaPlanView`) grouping suites
  by test type; i18n `stages.qa.*` (tally uses `{{n}}`, not `count`, to dodge the
  Arabic CLDR-plural trap) + `project.tab.qa` (EN+AR). Shared: `qa-plan.ts`
  (`TEST_TYPES`).
- **Code scaffolding (`scaffold`).** A Pro-only stage that turns the confirmed
  design into a **runnable NestJS + Prisma backend**. Like the cost estimator, the
  generation is **fully deterministic — no LLM**: `buildBackendScaffold()` in
  `@archivato/shared` (`scaffold.ts`, runtime-free) maps DB entities/relations →
  `prisma/schema.prisma` models, and API modules/endpoints → NestJS
  modules/controllers/services + class-validator DTOs, plus root project files.
  **Correctness over richness:** output always compiles / `prisma validate`s —
  FKs are emitted as scalar fields + a `// FK →` comment (never Prisma relations,
  which could be invalid), service methods are typed stubs that throw "Not
  implemented", exactly one `@id` is guaranteed (a flagged PK, else a promoted
  `id` column, else a synthesized one — never a duplicate), and colliding
  module/entity names are uniquified so the generated project always builds. The
  `ScaffoldService` reuses `ExportService.bundle()` (so it inherits the "pipeline
  complete through API design" 409 gate). Owner-guarded + `ProGuard` (mirrors
  export); GitHub routes throttled (`THROTTLE_EXTERNAL`). Delivered two ways:
  - **ZIP** (`GET /scaffold/:id/zip`, server-zipped via `jszip`).
  - **Push to GitHub** (`POST /scaffold/:id/github`) via a native-`fetch` client.
    Because GitHub's Git Data API **rejects a tree on an empty repo (409 "Git
    Repository is empty")**, the repo is created with **`auto_init:true`**, then:
    read base ref → create tree of our files → commit parented on the initial
    commit → **fast-forward `main` (PATCH ref)**. The client **retries transient
    failures with backoff** (network timeouts + 404/409/5xx — the git backend
    lags just after repo creation) and surfaces GitHub's real status/message on
    failure. Token resolution: an optional **PAT** in the request (used once,
    never stored) **or** the user's **stored OAuth connection** (below).
- **"Connect with GitHub" (stored OAuth).** A per-user GitHub connection so push
  needs no token. Separate concern from login OAuth: `GithubOAuthService` (scope
  `repo`, callback `/api/scaffold/github/connect/callback`) uses
  `GITHUB_SCAFFOLD_CLIENT_ID/SECRET`, **falling back to the login
  `GITHUB_CLIENT_ID/SECRET`** so users can reuse their existing OAuth App (they
  just add the scaffold callback URL). Flow (popup): `GET …/connect/start`
  (`JwtAuthGuard`) sets an **HMAC-signed state cookie** binding userId+nonce+exp,
  redirects to GitHub; `GET …/connect/callback` (public, state-verified) exchanges
  the code, **encrypts the access token at rest** (`TokenCipher`, AES-256-GCM;
  key from `GITHUB_TOKEN_SECRET` ?? `JWT_ACCESS_SECRET`), upserts
  `github_connections` (one per user, cascades on delete), and returns HTML that
  `postMessage`s the result to the opener and closes. `GET …/connection` (status:
  `available`/`connected`/`login`), `DELETE …/connection` (disconnect). Repo
  pattern (in-memory + Prisma). **Web:** `ScaffoldView` (in `ExportView`) shows a
  **Connect with GitHub** button (opens the popup, listens for the `postMessage`
  from the API origin) → connected state (`login` + Disconnect) → push with no
  token; a **"use a token instead"** toggle keeps the PAT path. i18n'd
  `stages.scaffold.*` (EN+AR).
- **Public share links (`share`).** A read-only page for a **finished** design that
  anyone can open with no account — the product's organic loop. One `share_links`
  row per session (repo pattern; `sessionId` PK, unique `token`, `viewCount`).
  The token is **32 CSPRNG bytes base64url** and is the link's only credential.
  Owner routes (`/share/:sessionId`, `JwtAuthGuard + SessionOwnerGuard`): `GET`
  (link or null), `POST` (mint — **`ProGuard`**), `DELETE` (revoke). **Only minting
  is Pro-gated** — a downgraded user must still be able to see and kill a link they
  already published. `create` is **idempotent** (sharing twice never invalidates a
  link already sent out); **revoke is a hard delete**, so the token dies for good
  and re-sharing mints a new one (there is no "pause"). The pipeline gate is free:
  `ShareService` reuses **`ExportService.bundle()`**, which 409s until the API
  design exists.
  - **The public payload IS the security boundary.** `GET /shared/:token`
    (separate `SharePublicController`, so a token can never collide with a session
    id on the route table) returns strictly `SharedProject` (`@archivato/shared`):
    the design chain + optional review + the title/idea — **no interview
    transcript** (the user's own words about their business), no owner, and **not
    even the session id**. Every artifact is stamped with `sessionId`, so the
    projection **overwrites it with the token** — an internal id that addresses
    owner-scoped routes has no business on a public page. A design that later
    regresses (a version restore drops the API design) 404s rather than surfacing
    the 409 a stranger couldn't act on.
  - **The token is a bearer credential — never write it down.** It is the whole
    security boundary, so it must not land in any store with a *different* access
    model than the link itself. Two sinks would have leaked it and both are now
    scrubbed through one shared `redactSharePath()` (`share.ts`, covers `/s/<t>`
    **and** `/api/shared/<t>`): the **pageview beacon** (the admin "Top pages" panel
    renders paths verbatim to anyone holding `admin:analytics` — a role with *no*
    project access, who could then just open the link), redacted client-side **and
    again server-side** because that beacon is public and unauthenticated; and the
    **`AllExceptionsFilter` log line**, which would otherwise ship a live token to
    the log pipeline/Sentry on any 5xx. Any new sink that records a URL must call
    it too. `/share/:sessionId` (the *owner's* route) is deliberately NOT redacted —
    a session id is not a credential.
  - **The public read is `@SkipThrottle()`** (the Paddle-webhook precedent). The
    page is **server-rendered**, so every viewer reaches the API from the same
    Next.js server IP — IP-keyed throttling would put a link's whole audience in
    one bucket and start 429ing readers exactly when a link takes off. What guards
    it instead: an unguessable token (nothing to enumerate) + a read-only
    projection; burst protection belongs at the edge (Cloudflare, per DEPLOY.md).
  - **Unlisted, not published.** The page is **`noindex`** and `/s/` is disallowed
    in `robots.ts` — someone's business idea turning up in a Google search for
    their company would be a nasty surprise. The **per-project OG card**
    (`shareOgImage()` in `lib/og.tsx` — their title + architecture/services/tables/
    endpoints) still unfurls in Slack/X/LinkedIn, which is where the loop lives.
  - **Web.** `app/s/[token]/page.tsx` is a **server component** outside the `(app)`
    group (no AuthGate, no app providers): it fetches once (`cache`-deduped across
    `generateMetadata` + body) and passes the payload to `SharedProjectView`, which
    renders the **same artifact `*View` components** the owner sees (they're pure
    functions of their artifact — the `ExampleProjectView` proof) and ends in a
    "Built with Archivato" CTA. It mounts the one provider it actually needs
    (`ToastProvider`, for ErDiagram's export buttons) and awaits its **own lazy i18n
    tier** — `loadShareNamespaces()` / `resources.share.ts` = **`stages` + `share`
    only**, because a cold visitor following a link shouldn't download the dashboard's
    and admin console's copy. `SystemDesignView` gets `interactive={false}` (Explain
    calls an owner-scoped API). The **not-found state is server-rendered English**:
    it must render without the lazy chunk. Owner controls: `ShareLinkCard` in the
    Export tab (create/copy/views/revoke; 402 → `useUpgrade`).
- **Streaming generation (`stream`) — the "narration layer".** A live alternative
  to the poll-based `/jobs` path for the 5 pipeline stages. `GET /stream/:sessionId/:stage`
  is a Nest **`@Sse()`** endpoint (owner-guarded by the same `SessionOwnerGuard`,
  `@Throttle(THROTTLE_AI)`, records the `generate` analytics event). Because
  artifacts are **structured JSON** and every agent has a **deterministic fallback**
  (mock mode / a failed model call emit zero tokens), we do **not** stream raw JSON.
  Instead `StreamService.run()` (async generator → Observable) runs the **same
  `service.generate()` the worker runs** (real LLM or fallback — persists +
  `versions.snapshot()`), then streams a human-readable **narration** of the
  finished artifact via the pure `buildNarration(stage, artifact)` in
  `@archivato/shared` (`streaming.ts`, runtime-free, unit-tested) — typed out
  chunk-by-chunk. Deterministic ⇒ reads identically offline and with a real
  provider. The **Pro gate is asserted first**, inside the generator (before any
  generation), emitted as an `error` event `code:'upgrade_required'` — a direct
  SSE connection can't bypass it. Heartbeat `ping` events keep the connection
  alive through a slow model call. **BullMQ/`/jobs` stays as the fallback.**
  **Web:** `streamStage()` (`lib/stream.ts`) opens a native `EventSource`
  (`withCredentials`), folds events with `reduceStreamEvent` into a `StreamView`,
  and **falls back to `jobsApi.run` if SSE errors before the first event** (covers
  proxies that block SSE + expired auth cookies EventSource can't refresh).
  `StreamingConsole` renders the live terminal-style feed (active-step spinner +
  typed reveal + blinking caret, `motion-reduce`-aware); `dashboard/page.tsx`
  `generateStage` drives it. Narration text is **server-side English** (per the
  i18n convention that AI output stays English); only the chrome is i18n'd
  (`project.stream.live`, EN+AR).
- **"Explain this decision" (`ArchitectExplainer`).** An on-demand rationale for
  one System Design choice — the architecture, a tech-stack pick, or a service.
  `POST /system-design/:sessionId/explain` (owner-guarded, `@Throttle(THROTTLE_AI)`),
  body `{ kind:'architecture'|'tech'|'service', key }` (`ExplainDecisionDto`).
  LLM-driven with a deterministic knowledge-based fallback
  (`buildDecisionExplanation()` in `@archivato/shared` — pure/tested; a
  `TECH_KB`/`ARCHITECTURE_KB` map + generic path so unknown techs still get a
  complete shape). **Ephemeral** (never persisted). Free stage (no `ProGuard`),
  just throttled. Web: an `ExplainButton` beside each choice in `SystemDesignView`
  opens `DecisionExplainModal` (rationale/tradeoffs/alternatives/risks). i18n
  `stages.system.explain.*` (EN+AR).
- **Agents backfill via `normalize()`.** Where an artifact has many optional
  parts (e.g. the reviewer's per-dimension scores/findings), the agent trusts a
  valid LLM response but fills any omitted field deterministically, so the shape
  is always complete. New optional fields on a JSON-stored artifact need
  defensive defaults in consumers (view + markdown export) for old rows.
- **Repository pattern everywhere.** Every store has an interface + in-memory
  impl (used by unit tests, DB-free) + Prisma impl. Feature modules provide the
  Prisma repo.
- **Billing / project quota.** Capacity is a **max-projects-owned** count (dollars
  are plan prices): **Free = 1 project**, **Pro → 5 projects** (**$19/mo** or
  **$182/yr — 20% off**). **Annual is a cadence, not a tier:** an orthogonal
  `billingCycle: 'monthly' | 'annual'` on the subscription changes only the price,
  the period length (mock: +30d vs +365d; Paddle supplies real dates), and the
  Paddle price id (`PADDLE_PRICE_ID_ANNUAL`, falls back to the monthly id). Nothing
  keyed on `plan` changes — `isPro`/quota/`effectivePlan`/the freemium gate are
  identical for annual. Cadence is chosen at **checkout** (`POST /billing/checkout`
  body `{billingCycle}`, `CheckoutDto`); switching = a fresh checkout/new period
  (mock immediate; Paddle prorates as MoR). `annualSavings()`/`monthlyEquivalent()`
  in `@archivato/shared` are pure helpers; **admin MRR normalizes annual** to
  `annualPrice/12`. Web: monthly/annual toggle in the **UpgradeModal** (default
  annual) + **landing pricing**, cadence badge in **settings** (i18n `billing.cycle.*`
  / `pricing.cycle.*`, EN+AR). Enforced
  at **project creation** (`InterviewService.start`: `repo.countByUserId` vs
  `BillingService.getProjectQuota` → **402** when at the limit). To start another
  at the cap you **delete** a project (`DELETE /interview/:id`, owner-guarded,
  cascades all artifacts) or upgrade. Deliberately simple: **no per-confirm
  consumption and no usage table** — the project list *is* the meter, so the UI
  computes "used" from the project count (billing only returns the quota/limit).
  `BillingModule` is imported by `InterviewModule` (one-way; billing never reads
  sessions). Payments sit behind a **`BillingProvider`** (mirrors `LlmProvider`):
  `BILLING_PROVIDER=mock|paddle` forces it, else Paddle when `PADDLE_API_KEY` is
  set, else the **offline mock** (instant upgrade, no charge — the default, fully
  demoable/testable). **Cancel is at-period-end** (mock *and* Paddle): the user
  keeps Pro until `currentPeriodEnd`, then `effectivePlan` drops them to Free
  automatically (the mock provider returns `downgradeNow:false`; settings shows
  "ends {date}" + a "cancels at period end" badge). Paddle is Merchant-of-Record:
  checkout runs client-side (Paddle.js) and activation/cancellation arrive via
  **`POST /billing/webhook`** (HMAC-verified over the raw body — `main.ts` sets
  `rawBody: true`). Subscriptions are created lazily (`getOrCreate`) so existing
  users get a free plan on first access.
- **Freemium feature gate.** Beyond the project *count* cap, the pipeline itself
  is tiered: **Free covers interview → requirements → system design → database
  design** (plus Product Vision); **Pro is required to generate the API design
  and everything after it — AI review, roadmap, cost estimate, and export.**
  Enforced by `BillingService.assertPro(userId)` (throws **402**
  `code:'upgrade_required'`) and a reusable **`ProGuard`** (exported by
  `BillingModule`) applied to the Pro-only generate routes
  (`api-design`/`review`/`roadmap`/`cost-estimate` generate, all of `export`).
  The async path is gated in `JobsController` (per-stage: `PRO_STAGES
  = {api-design, review}`). The web wall lives on the **API tab** (`ProjectStages`
  shows an `UpgradeStage` prompt when `!isPro`); the Pro tabs (`PRO_TABS`: api,
  review, roadmap, cost, export, apidocs, refine) carry a **lock badge** for free
  users, and clicking a still-unreachable one opens the upgrade modal
  (`useUpgrade`) instead of a blank tab.
- **LLM behind `LlmProvider`.** Agents (`llm/agents/*`) depend only on the
  interface and use `completeJson<T>()` (strips fences, throws
  `LlmJsonParseError`). **Every agent has a deterministic fallback**, so bad/no
  model output still yields a valid artifact (mock mode + tests stay offline).
- **Agent prompt quality + provider hardening.** All 14 agents share one prompt
  standard: a senior-role **system prompt** (role → method → an explicit *output
  standard* clause: specific to THIS system, actionable, precise terminology, no
  invented scope, complete/consistent, strict-JSON-only) plus a structured
  **input prompt** with field-level guidance. Output *schemas* are unchanged
  (backward-compatible with views/exports). Provider layer: `json.util.ts` uses a
  string/escape-aware **balanced-brace scan** + trailing-comma repair (robust vs.
  fence/prose/partial output); `ClaudeLlmProvider` only sends `temperature` to
  models that still accept it (Opus 4.7/4.8, Sonnet 5, Fable/Mythos 5 **400** on
  sampling params — so bumping `ANTHROPIC_MODEL` never breaks every call) and
  marks the stable system prompt with `cache_control` (prompt caching);
  `GroqLlmProvider.completeJson` uses Groq's native **`response_format:
  json_object`** for guaranteed JSON (the structured-output path for the default
  real-AI provider). The deterministic fallbacks are a **resilience layer, not
  mock data** — they only run when no LLM is configured or the model fails.
- **LLM usage metering (`llm/usage`) — margin protection.** Every model call made
  through the `LlmProvider` seam is recorded: provider, model, **agent**, stage,
  user, session, tokens, cost, ok/failed, duration. One `llm_usage` row per call
  (repo pattern; append-only, **no FK**, so it outlives the user/session). It stores
  **counts only — never prompt or completion content** — so a role holding just
  `admin:analytics` (no project access) can safely report on it.
  - **Cost is deterministic — no billing API, no LLM.** `estimateLlmCostUsd()` in
    `@archivato/shared` (`llm-usage.ts`, runtime-free/tested) prices a call off a
    per-model catalog (`MODEL_PRICING`, list prices, longest-prefix match so a dated
    snapshot id prices off its base model), applying the cache-read (0.1×) and
    cache-write (1.25×) multipliers. **An unlisted model returns `null`, not 0** —
    it records tokens with a null cost and the admin totals surface it as
    `unpricedCalls`, because a blank $0.00 next to real traffic is worse than
    useless in a tool whose whole job is margin protection. Prices drift: **edit
    the table** when a provider changes them.
  - **Capture seam = a decorator, not 4 edits.** `UsageTrackingLlmProvider` wraps
    whichever provider `LlmModule` resolved, so agents are untouched and there is
    exactly one place that turns a call into a row. Tokens come *out* of a provider
    via an **`options.onUsage` callback** (an API-local extension of
    `LlmCompleteOptions`, never sent to a model) — **not** a "usage of the last
    call" field, which the concurrent pipeline would scramble. Claude's
    `input_tokens` is the *uncached remainder*, so the adapter sums it with the
    cache tokens; the OpenAI-shaped providers (Groq/Azure) already report the total
    (`openai-usage.ts`). A **failed call is still recorded** — the case that matters
    is a `completeJson` whose model call *succeeded* and whose JSON then failed to
    parse: we were billed for those tokens even though the agent fell back to its
    deterministic path. No usage report at all (mock, or a request that died before
    a response) ⇒ nothing was billed ⇒ **$0, not "unknown"**.
  - **Attribution = `AsyncLocalStorage`, established in exactly 2 places.** The
    provider can see the model but has no idea *who* asked; threading a caller
    through 14 agents and a dozen services would be a wide, invasive change. So
    `llm-usage.context.ts` carries `{userId, sessionId, stage}` ambiently:
    **`LlmContextInterceptor`** (global `APP_INTERCEPTOR`) covers every HTTP route
    (incl. SSE stream, chat refine, explain, support AI) — it must **subscribe to
    `next.handle()` INSIDE `als.run()`**, because Nest *defers* the route handler
    until subscription and wrapping the call alone would run it outside the store
    (there's a test that fails if you regress this); and **`PipelineProcessor`**
    re-establishes the same context from the job payload, since a BullMQ worker has
    no request (`GenerateJobData` gained an optional `userId`). Stage = the explicit
    `:stage` param (jobs/stream) else the **first path segment after `/api`**;
    anything unrecognized normalizes to `other`. `BaseAgent.think*` stamps
    `agent: this.role` — one edit, all 14 agents attributed.
  - **Metering is best-effort, always.** `LlmUsageService.record` swallows its own
    failures and the decorator fires it without awaiting: a metering outage costs a
    row, never the artifact the user already paid for (in tokens *and* wall-clock).
  - **Admin.** `GET /admin/llm-usage` (`admin:analytics`) → 30-day totals + 7-day,
    daily cost/token series, and breakdowns by stage / model / agent / heaviest
    user. The heaviest-spender rows are labelled with an **email only for a caller
    who also holds `admin:users:read`** — spend is an analytics question, "which
    email spent it" is a user-directory one, and an analytics-only role must not be
    handed the email list as a side effect. Web: `LlmUsagePanel` on `/admin`
    (i18n `admin.llm.*`, EN+AR) + `useFormat().usd()` (sub-cent precision below $1 —
    rounding a fraction-of-a-cent call to `$0.00` would make spend read as free).
- **Provider selection** (`llm.module.ts`): `LLM_PROVIDER=mock|claude|groq|azure`
  forces it for all agents; else `GROQ_API_KEY` present → groq for everything;
  else `AZURE_OPENAI_API_KEY` present → azure; else mock. **Groq keeps priority
  over Azure** so the documented "paste a free Groq key" behaviour is unchanged —
  force with `LLM_PROVIDER=azure` when both keys exist.
  `INTERVIEW_LLM_PROVIDER` overrides only the interview. Model via
  `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`; `claude-opus-4-8` available).
- **Azure OpenAI (`AzureOpenAiLlmProvider`).** OpenAI-shape chat completions, so it
  mirrors `GroqLlmProvider` (incl. native `response_format: json_object` in
  `completeJson`), with three Azure specifics: the model is chosen by the
  **deployment name in the URL** (an `options.model` maps onto that segment, not a
  body field), auth is an **`api-key` header** (not Bearer), and the request needs
  an **`api-version`** query param. Env: `AZURE_OPENAI_API_KEY` +
  `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_DEPLOYMENT` (all required, constructor
  throws otherwise) and `AZURE_OPENAI_API_VERSION` (default `2024-10-21`, a GA
  version with JSON mode). Native `fetch`, no SDK. Targets chat deployments
  (gpt-4o/4.1/35-turbo) — the o-series reasoning models reject `temperature` and
  want `max_completion_tokens`.
- **Interview shape.** Kept **short: ≤ 9 questions** (`MAX_ADAPTIVE_QUESTIONS`,
  and `QUESTION_PLAN` is 9 long so the 90% gate closes by Q9). Questions may carry
  `options` + `multiple` on `InterviewQuestion` — the web renders tap-to-pick
  chips/checkboxes; the answer stays a **string** the client composes (picks +
  free-text detail), so the `answer` DTO/state machine are unchanged. The
  adaptive interviewer may also return `options`/`multiple` (mapped in
  `tryAdaptive`); plan questions ship curated options for scale/tech/features.
- **Gating:** each stage refuses to generate until its upstream artifacts exist
  (interview must be `confirmed`); returns 409/404 accordingly.
- **Ownership:** pipeline routes are `@UseGuards(JwtAuthGuard, SessionOwnerGuard)`.
  `SessionOwnerGuard` (exported by InterviewModule) 404s on missing/not-owned
  sessions (no existence leak). Sessions carry a nullable `userId`.
- **Auth:** JWT access + opaque refresh, both **httpOnly cookies**
  (`archivato_access` 15m, `archivato_refresh` 7d). Only token *hashes* stored;
  refresh rotated single-use. Email verify + forgot-password (OTP) + OAuth
  (Google/GitHub, manual code flow). Web client auto-refreshes on 401.
- **Mail behind a provider switch** (`MailService`, mirrors `LlmProvider`/
  `BillingProvider`). `MAIL_PROVIDER=resend|smtp|preview|log` forces it, else
  auto-resolves: `RESEND_API_KEY` → **resend** (HTTP API via native `fetch`, no
  SDK — recommended for prod, survives blocked SMTP ports) → `SMTP_HOST` → **smtp**
  → `MAIL_PREVIEW=true` → **preview** (Ethereal) → **log**. `from` = `MAIL_FROM`
  ?? `SMTP_FROM` (must be a provider-verified domain). Provider is logged on boot;
  `preview`/`log` under `NODE_ENV=production` warns. **Sends are best-effort at
  the caller** (`EmailVerificationService.issueAndSend`,
  `PasswordResetService.request` wrap the send in try/catch): a provider outage
  must not fail sign-up, and — critically — must not turn forgot-password into an
  email-enumeration oracle (a throw is only reachable for accounts that exist,
  vs. the always-200 miss path).
- **One account per device (anti-spam):** local registration is gated on a
  client-computed browser fingerprint (`apps/web/lib/device-fingerprint.ts`).
  Only its SHA-256 hash is stored (`device_registrations`, unique — race-safe);
  a device that already registered gets a 409. `RegisterInput.fingerprint` is
  optional in the type (so the service/OAuth path stay usable) but **required by
  `RegisterDto`**, so every browser sign-up carries one. **OAuth is gated too:**
  the client computes the fingerprint before the redirect, `/oauth/:p/start`
  stashes it in a short-lived cookie (`archivato_oauth_fp`), and the callback
  enforces the same one-per-device rule — but **only when creating a NEW
  account** (signing back into an existing account is never gated; a device
  conflict redirects to `/login?error=oauth_device`). Best-effort by design (a
  fresh browser profile/incognito reads as a new device).
- **Account settings** (`/settings`, guarded route; gear link in the app
  header): edit display name (`PATCH /auth/profile`), change or **set** a
  password (`POST /auth/change-password` — OAuth-only accounts set a first one
  with no current password, which adds the `password` provider; success revokes
  all other sessions and re-issues cookies for the current device), theme
  toggle, and a danger-zone **delete account** (`DELETE /auth/me`, cascades all
  projects). `UserRepository.delete` added across impls.
- **Profile picture (avatar).** A nullable `avatarUrl` on the user holds **either**
  a base64 image `data:` URI (user upload — stored **inline**, no object store,
  matching the support-attachment convention) **or** an external provider URL. Set
  via `PUT /auth/avatar` (`UpdateAvatarDto`: `@Matches` a `data:image/(png|jpe?g|
  webp|gif);base64,…` URI, `@MaxLength(100_000)` so the JSON body stays under
  Express's ~100 KB default parse limit — no body-limit change needed), cleared via
  `DELETE /auth/avatar`; both owner-scoped (`JwtAuthGuard`, act on `user.id`) and
  return the updated `AuthUser`. The client (`lib/avatar.ts` `fileToAvatarDataUri`)
  **center-crops + resizes to a 256px square JPEG** and steps quality down until
  the encoded string fits, so real uploads are tiny. **OAuth captures the provider
  avatar** (`OAuthProfile.avatarUrl` ← Google `picture` / GitHub `avatar_url`):
  set on account creation and **backfilled onto a picture-less existing account,
  but never clobbering** a picture the user set. Web: reusable
  `UserAvatar` (`components/shared/UserAvatar.tsx`) renders the image or an
  **initials fallback** on a stable name-derived hue (`initialsFromName()` in
  `@archivato/shared`, unicode-safe/tested; falls back to initials on `<img>`
  error too) — used in the `AuthGate` header **account menu**, the settings
  **Profile** card (upload/change/remove), and the admin users table. i18n
  `settings.profile.{addPhoto,changePhoto,removePhoto,photoHint,…}` (EN+AR).
- **Header account menu (`AccountMenu`).** The signed-in `AuthGate` navbar groups
  the utility controls (language, theme, customer Support link, `NotificationBell`)
  and ends with an **avatar dropdown** (`components/shared/AccountMenu.tsx`) — the
  identity header (avatar + name + email + an unverified badge) over **Settings**
  and **Sign out** menu items. It replaces the old inline name + gear + sign-out
  buttons, and follows the `NotificationBell` dropdown pattern (relative wrapper +
  outside-click/Escape close, `end-0` for RTL). i18n `header.account` (EN+AR).
- **Language dropdown (`LanguageMenu`).** The app chrome's language switcher is a
  **flag dropdown** (`components/shared/LanguageMenu.tsx`): the trigger shows only
  the current locale's **inline-SVG flag** (no text — and SVG, not emoji, because
  flag emoji don't render on Windows browsers), and the menu lists each locale as
  flag + name with a check on the active one. Same dropdown mechanics as
  `AccountMenu`. Used in the `AuthGate` header + guest controls **and the landing
  nav** (`LandingNavActions`); the compact text `LanguageToggle` (in `i18n.tsx`)
  now only remains on the **legal** pages (`LegalDocument`).
- **SuperAdmin + analytics.** `User.role` (`'user'|'admin'`, shared
  `AccountRole` — distinct from the requirement-doc `UserRole`). The primary
  bootstrap is a **seeded account**: `SuperAdminSeeder` (`onModuleInit`, AuthModule)
  reads **`SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD`** and, on boot, creates a
  **pre-verified, ready-to-log-in** super-admin (no self-registration), always
  ensuring the `super_admin` role + legacy `role='admin'` column and keeping the
  password in sync with the env (credentials-as-config; runs after RoleService
  seeds the roles). The legacy **`ADMIN_EMAILS`** allowlist (`AuthService.syncRole`,
  promote-on-login, promote-only) still works but is now **empty by default** —
  superseded by the seeded account. `AdminGuard` (exported by AuthModule) 403s
  non-admins.
  **Analytics** (`analytics` module) records events (`AnalyticsEvent`: pageview
  / signup / login / generate): a **public `POST /analytics/track`** beacon logs
  anonymous landing pageviews (sets an httpOnly `archivato_vid` visitor cookie),
  and signup/login (AuthService) + generate (JobsController) are recorded
  server-side via `AnalyticsService.recordSafe` (best-effort, never breaks the
  flow). The **`admin` module** is a read-only report model: `AdminService`
  aggregates users/projects/subscriptions **directly via Prisma** (a deliberate
  reporting exception to the repo pattern) plus `AnalyticsService` events, behind
  `@UseGuards(JwtAuthGuard, AdminGuard)` — `GET /admin/{stats,traffic,users}`,
  `PATCH /admin/users/:id/role`, `DELETE /admin/users/:id` (can't target self).
  Web: `/admin` dashboard (KPIs, 30-day trend SVG charts, top pages/referrers,
  user table with role/delete) — self-guards (bounces non-admins); a `ShieldCheck`
  header link shows only for admins; `PageviewTracker` in the layout fires the
  beacon on every route (excludes `/admin`). **Admins are stats-only**: `POST
  /interview` 403s for them (`InterviewController.start`) and the dashboard shows
  an admin notice (link to `/admin`) instead of the project creator — so an admin
  account never owns or generates projects.
- **RBAC (`roles`) — dynamic roles + a static permission catalog.** Authorization
  has **three independent axes**, kept separate: **ownership** (`SessionOwnerGuard`
  / owner-or-permission checks), **entitlement** (`ProGuard`, plan/billing), and
  **role/permission** (this). The **permission catalog is code-defined** in
  `@archivato/shared` (`permissions.ts` — a `Permission` only means something
  because a guard checks it, so admins can't invent capabilities), while
  **roles, their granted permissions, and assignment are DB-managed/editable at
  runtime** (`roles` + `user_roles` tables). A user holds **multiple roles**;
  effective permissions = **union** (`resolvePermissions`, filtered by
  `isPermission` so stale DB strings grant nothing). `RoleService`
  (`onModuleInit`) seeds the system roles (`SYSTEM_ROLES`): **super_admin** (full
  catalog, reconciled every boot + locked in `updateRole` so it can't be locked
  out), **support_agent** (all `support:*`), **billing_admin** (`billing:manage`),
  **user** (none). `AuthUser` is enriched with `roles`/`permissions` in
  `JwtStrategy.validate` (resolved fresh per request → grants apply promptly) and
  every `AuthService` response; the legacy `role` field is **derived** (`admin`
  iff holds super_admin). Enforcement = **`PermissionGuard` + `@RequirePermissions`**
  (AND semantics; method metadata overrides class). `ADMIN_EMAILS` bootstraps
  super_admin in `syncRole` (also keeps the legacy column in sync); `AdminService.setRole`
  bridges the old promote/demote button to assign/remove super_admin. `RolesModule`
  imports **nothing** from Auth (AuthModule imports it — one-way, no cycle);
  role-management controllers live in **AdminModule** (which has both Auth guards +
  RoleService), gated by `admin:roles:manage`. **Billing Admin console:**
  `billing:manage` gates a dedicated console (`BillingAdminController` +
  `BillingAdminService` in BillingModule, a Prisma reporting read-model like
  AdminService). Read: `GET /billing/admin` (subscription/revenue KPIs — MRR, ARPU,
  active-Pro, free, canceling, past-due — plus a **filtered, paginated** page of
  rows: `?q=&plan=&status=&page=&pageSize=`), `GET /billing/admin/trends` (30-day
  new-Pro vs churn), `GET /billing/admin/subscriptions/:userId` (detail + event
  history). Write actions run through **`BillingService`** (not the read-model):
  `POST …/:userId/grant-pro` (comp to Pro, no expiry) and `…/revoke` (immediate
  downgrade) — both **refuse Paddle-backed subs** (409 `paddle_managed`; those are
  managed in Paddle) and write a **`BillingEvent`** audit row. That audit log
  (`billing_events`, own repo; recorded best-effort on checkout/cancel + admin
  grant/revoke) is the source for the trends chart and the per-customer history.
  Web `/admin/billing` self-guards on `billing:manage`: KPI tiles, trend chart,
  search + plan/status filters, pagination, CSV export, and expandable rows with
  grant/revoke + a Paddle deep-link. i18n `billing.admin.*` (EN + AR). Scoped to
  billing only — no user/analytics access. `/admin` split into
  `admin:analytics`/`users:read`/`users:manage`; the support staff panel now needs
  `support:read_all` (a support_agent works tickets without full admin), and
  ticket assignees must hold `support:read_all` (`assertAssignable`). **Support
  permissions are enforced per action, not just per panel:** `support:read_all`
  grants *read* to every ticket, but each write needs its own permission —
  `support:reply` to answer a ticket you don't own (an owner always replies as the
  customer), `support:manage` to change status/priority/category (incl. staff
  close/reopen of others' tickets), `support:assign` to (re)assign, `support:note`
  for internal notes, `support:copilot` for the admin AI copilot. Enforced in
  `SupportService` (per-field in `adminUpdateTicket`; `requirePermission`/
  `assertCanChangeStatus` helpers), so a "view all tickets"-only role can look but
  not touch. The admin `PATCH /support/admin/tickets/:id` route only guards
  `support:read_all` (the service splits manage vs assign). **Web:** the staff
  `TicketDetail` takes a `caps` prop ({reply,manage,assign,note,copilot} from the
  viewer's permissions) and hides the reply box (→ read-only notice), status
  buttons, manage/assign selects, notes, and copilot accordingly. A
  shared `hasPermission()` drives nav + self-guards (the Support "Admin" tab, the
  `/admin/roles` link, page redirects); the **`/admin/roles`** page has a grouped
  **permission grid** (roles CRUD) + a **user role-assignment** editor.
- **Staff = console-only accounts (`isStaffUser`).** A user is **staff** iff they
  hold *any* permission (`isStaffUser(permissions)` in `@archivato/shared` — a
  plain `user` holds none). Staff **cannot create projects**: `InterviewController.start`
  403s any staff (generalizing the old `role==='admin'` block to support/billing
  agents too). Staff get a **unified admin console** instead of the project
  creator (see the AdminShell bullet below); regular users keep the project
  dashboard.
- **Admin console shell (`AdminShell` + permission-aware sidebar).** All staff
  consoles share one professional chrome: a persistent **left sidebar** (below
  the global `AuthGate` header) listing only the consoles the viewer's
  permissions grant — the **union** of their roles. Single source of truth is
  `components/admin/admin-nav.ts` (`ADMIN_NAV` groups General/Support/Platform/
  Billing; each item gated by a `Permission`, `null` = any staff; `visibleNav()`
  filters, `activeNavKey()` picks the longest-prefix match). `AdminShell`
  (client) self-fetches `/auth/me` for the nav and **re-resolves on focus**
  (permission-revalidation convention), with a mobile drawer. It's applied via
  **route-group layouts** — `app/admin/layout.tsx` (wraps `/admin`, `/admin/roles`,
  `/admin/billing`) and `app/support/admin/layout.tsx` (wraps `/support/admin`,
  `…/kb`, `…/[id]`) — so those pages return **bare content** (the shell provides
  the `max-w-6xl` container; their old per-page `mx-auto` wrappers + back-links +
  the staff `SupportNav` were removed). The staff **`/dashboard`** early-returns
  `<AdminShell><AdminOverview/></AdminShell>` — a welcome + a card per reachable
  console (built from the same nav). i18n `admin.nav.*` / `admin.overview.*`
  (EN+AR). Because the sidebar now handles staff navigation, the **`AuthGate`
  header dropped its Admin quick-link and shows the Support link to customers
  only** (staff use the sidebar). The customer `SupportNav` is unchanged (customer
  support pages aren't under `/support/admin`). Server-side guards remain the real
  boundary; the shell is navigation/UX only (pages still self-guard via
  `usePageAccess`).
- **Super-admin provisions staff (no self-registration).** `AuthService.provisionStaff`
  creates an account directly: it **bypasses the one-account-per-device gate**,
  marks it **pre-verified**, generates a **strong random password** (`password-generator.ts`,
  CSPRNG, unambiguous charset) returned **once** in plaintext for hand-off (only the
  hash is stored), then assigns the given RBAC roles. Endpoint: `POST
  /admin/roles/provision-user` on `AdminRolesController` (already `admin:roles:manage`
  → Super Admin only), body `ProvisionUserDto` (email + displayName + non-empty
  `roleIds`). **Web:** a "Provision staff account" card on `/admin/roles` (English,
  matching that internal admin page) shows the password once with a copy button.
- **Customer Support Center (`support`).** A Zendesk-style ticketing system with
  an embedded **three-layer AI Support Assistant**, **free for all users** (no
  Pro gate). One `SupportRepository` (interface + in-memory + Prisma) owns the
  whole aggregate — `support_tickets` (+ auto-increment `number`), `_messages`,
  `_attachments`, `_internal_notes`, `_ticket_events`, `_ai_suggestions`,
  `_ai_interactions`. Enum-like fields (status/priority/category/authorType) are
  **string columns validated by shared unions** (project convention, not Prisma
  enums). `SupportService` holds the domain logic + **owner-or-admin
  authorization** (non-owner → **404**, no leak, mirroring `SessionOwnerGuard`);
  a **reply flips the waiting side** (customer→`waiting_admin`, admin→
  `waiting_customer`, stamps `firstResponseAt`) — `in_progress`/`resolved` are
  explicit admin actions, never reply side effects. Every action writes a
  **timeline event**. Customer routes = `JwtAuthGuard` (`SupportController`,
  `/support`); admin routes = `JwtAuthGuard + AdminGuard` (`SupportAdminController`,
  `/support/admin`). `SupportService` injects `PrismaService` **only** for
  `listAgents()` (assignee dropdown) — the AdminService reporting exception.
- **Support AI (`SupportAssistantAgent` + `SupportAiService`).** One agent, three
  methods, each LLM-driven with a **deterministic fallback** (offline mock + tests):
  `deflect()` (pre-ticket — answer + KB matches + the customer's OWN similar
  tickets + quick fixes + solved flag), `analyze()` (in-ticket — summary /
  rootCause / suggestedFix / suggestedReply / category+priority), `copilot()`
  (admin — `analyze` plus suggestedAssignment + system-wide similar tickets).
  **Security:** deflection/analyze "similar tickets" are scoped to the caller's
  own tickets; only the admin copilot (behind `AdminGuard`) searches all tickets —
  the AI never leaks another user's data. Deflection queries the **Knowledge Base
  store** (below) via `KbService.searchForDeflection` (published articles only).
  In-ticket/copilot runs persist a `SupportAiSuggestion`
  + an `ai_suggestion` event; deflection logs a best-effort `SupportAiInteraction`.
- **Knowledge Base (`kb`) — real, editable store.** No longer a static seed: a
  `kb_articles` table + repository (interface + in-memory + Prisma) owned by
  `KbService`, which **seeds the curated `KB_SEED`** (in `support-knowledge-base.ts`)
  on first boot **only when empty** (`onModuleInit`, best-effort — never blocks
  boot). Articles have a **`published`** flag: **drafts are hidden from customers
  AND excluded from AI deflection**. The keyword scorer is now the pure
  `searchArticles(articles, query, limit)` in `@archivato/shared` (`kb.ts`),
  shared by public search + deflection (deterministic/tested). **Public**
  (`KbController`, `JwtAuthGuard`): `GET /support/kb?q=` (published cards, `q`
  ranks via the scorer), `GET /support/kb/:id` (published detail, 404 on
  draft/missing). **Admin CRUD** (`KbAdminController`, `PermissionGuard` +
  `@RequirePermissions('support:kb:manage')`): `GET/POST /support/admin/kb`,
  `GET/PATCH/DELETE /support/admin/kb/:id`. New permission **`support:kb:manage`**
  (in `SUPPORT_PERMISSIONS` → Support Agent + Super Admin; super_admin auto-
  reconciled on boot — an **existing** support_agent role row needs the grant via
  `/admin/roles` since non-super-admin system roles aren't re-seeded). **Web:** the
  `/support/kb` reader (live-debounced search + category badges) + a
  `/support/kb/[id]` detail page (Markdown body via `MessageBody`); a
  **`/support/admin/kb`** manager (`KbManager`: list incl. drafts, create/edit
  form with published toggle, delete) gated by `usePageAccess(requirePermission('support:kb:manage'))`.
  `SupportNav` gained a `canManageKb` "Manage KB" tab. i18n `support.kb.*` /
  `support.kbAdmin.*` (EN+AR); article content itself stays server-side English.
- **Attachments = metadata + inline text.** No object store: the client extracts
  text from text-based files (log/txt/json) and sends it as `textContent` (stored
  inline for AI log analysis); binary files (image/pdf/zip) are metadata-only (no
  bytes served). Mime allowlist + 5 MB cap enforced by DTO. The mapper exposes
  only an `isText` flag to the client, never `textContent`.
- **Notifications (`notifications`) — in-app bell + email, wired.**
  `SupportNotificationsService` centralizes every ticket event and now delivers
  **two real channels** to the **involved party** (no staff broadcast): an
  **in-app** notification (bell/inbox) via `NotificationsService`, and an
  **email** via the shared `MailService`. Both are **best-effort** (the ticket
  write already committed; a notify/mail failure only logs). Recipients: new
  ticket / status change → owner; reply → the *other* side (admin reply → owner,
  customer reply → assignee); assignment → assignee; AI smart-alert → assignee
  (skipped if unassigned). Emails HTML-escape the (user-controlled) ticket subject
  and carry an absolute `WEB_ORIGIN` deep-link; in-app links are relative
  (`/support/tickets/:id` for the customer, `/support/admin/tickets/:id` for
  staff). The **`notifications` module** is a normal repo-pattern store
  (`notifications` table, in-memory + Prisma) exposing owner-scoped
  `GET /notifications` (items + unread count), `POST /notifications/read-all`,
  `PATCH /notifications/:id/read`; `NotificationsService.notify()` swallows its own
  failures so callers never need try/catch. **`MailService` gained a public
  `sendNotificationEmail(to,subject,body,link?)`** and is now exported from
  AuthModule. **Web:** a header **`NotificationBell`** (unread badge + dropdown,
  polls every 60s + on focus, mark-one/all-read, locale-aware relative time,
  RTL-safe) in `AuthGate`; `notificationsApi` in `lib/api`; chrome i18n'd
  (`common.notifications.*`, EN+AR) while the notification title/body stay
  server-side English (like other system output). **Web:** `/support/*` routes (`SupportNav` sub-nav:
  Dashboard · New · Knowledge Base · Admin), a `LifeBuoy` header link, the create
  form with the deflection panel on top, `TicketDetail` (conversation + timeline +
  AI sidebar + admin controls, driven by an `admin` prop), and the admin panel
  (`AdminSupportDashboard`: KPIs + SLA + AI-flagged + all-tickets table).
  Message bodies render Markdown fenced code via a lightweight `MessageBody`
  (React-escaped, no `dangerouslySetInnerHTML`). Support UI is fully **i18n'd**
  (EN + AR `support` namespace); labels/badges/relative-time come from a
  `useSupportMeta()` hook, and RTL-safe logical classes + `dir="auto"` throughout.
  Relative-time/duration keys use `{{n}}`/`{{value}}` (not `count`) so no CLDR
  plural set is needed.

## Frontend Notes

- **Web testing + lint (`apps/web`).** The frontend now has its own **Jest**
  setup via **`next/jest`** (`jest.config.js` → SWC transform, CSS/asset mocks,
  jsdom) + **React Testing Library** (`jest.setup.ts` loads `@testing-library/
  jest-dom`). Tests are colocated as `*.test.tsx` (distinct from the api's
  `*.spec.ts`); `moduleNameMapper` mirrors the tsconfig aliases (`@/*` +
  `@archivato/shared` → its **source**). Run with `npm run test:web`
  (`test`/`test:watch` in the web workspace). Prefer testing behavior/roles over
  markup; mock `react-i18next`'s `useTranslation` to an identity `t` for chrome
  components. **ESLint** is wired via **`eslint-config-next`** (`.eslintrc.json`
  extends `next/core-web-vitals`; `react-hooks/exhaustive-deps` set to `warn`) —
  `npm run lint --workspace @archivato/web` must stay clean. (Both were previously
  uninstalled — `next lint` prompted for interactive setup and there was no web
  test runner.) `react-i18next` with statically
  **bundled** JSON resources (`locales/{en,ar}/<namespace>.json`, registered in
  `lib/i18n/resources.ts` — namespaces: common, auth, marketing, dashboard,
  billing, interview, project, stages, settings, admin, support, legal). No locale routing: the
  `LanguageToggle` flips locale, persisted to `localStorage` + `archivato_locale`
  cookie; `LocaleProvider` (under ThemeProvider) applies it and sets
  `<html lang/dir>` (a pre-paint script in `layout.tsx` sets `dir` first to avoid
  an RTL flash). SSR renders the default (`en`); the client swaps on mount (minor
  EN→AR flash for Arabic users is a known trade-off of toggle-only). **RTL:** use
  logical Tailwind props (`ms/me/ps/pe`, `text-start/end`, `justify-start/end`)
  not physical ones; flip directional icons/arrows with `rtl:-scale-x-100`; put
  `dir="auto"` on any element rendering **AI-generated / user artifact text** (so
  English or Arabic content aligns itself) and `dir="ltr"` on email/password/code/
  path/table-name fields. **Locale-aware formatting:** `useFormat()`
  (`lib/i18n/format.ts`) returns `Intl` date/number formatters bound to the active
  locale (Arabic forced to Latin numerals via `ar-EG-u-nu-latn` for legibility in
  a dev tool) — use it instead of `toLocaleString()`. **Plurals:** i18next resolves
  the CLDR category per language and does **not** fall back `_few`→`_other`; a key
  called with `count` in Arabic needs the full set (`_zero/_one/_two/_few/_many/
  _other`) or it silently leaks the English `_other` via `fallbackLng`. AI **output**
  (agent prompts/artifacts) stays server-side/English for now — this slice is UI
  chrome only, except the interview, whose questions already adapt to the idea's
  language (`apps/api/src/interview/language.ts`).
- **Structure:** `app/` holds routes only. The **root** level is the lean public
  surface — `layout.tsx`, `page.tsx` (marketing **landing** at `/`), `privacy/`,
  `terms/`, `s/[token]/` (the public **share** page), and the metadata files
  (`icon.svg`, `apple-icon.tsx`, `opengraph-image.tsx`, `manifest.ts`, `robots.ts`,
  `sitemap.ts`). Everything authenticated lives in the **`(app)` route group** —
  `dashboard/`, `login/`, `register/`, `verify/`, `settings/`, `admin/`, `support/`
  (URLs unchanged; route groups don't affect paths). Feature components live in
  `components/<domain>/` (`auth`, `interview`, `design`, `review`, `product`,
  `roadmap`, `project`, `settings`, `shared`, `share`, `marketing`) alongside
  `components/ui/`. Import via the `@/*` alias
  (→ web root), e.g. `@/components/project/ProjectStages`, `@/lib/api`.
- **The `(app)`/root layout split is a performance boundary — keep it.** The root
  layout carries only Theme + Locale providers (+ PageviewTracker/CookieConsent);
  **`app/(app)/layout.tsx`** carries Toast → Confirm → Upgrade → `AuthGate`. With
  all of that in the root layout, the landing page downloaded and hydrated the
  entire authenticated app (auth form, account menu, notification bell, billing
  dialog) — the bulk of its unused JS and blocking time (Lighthouse Perf 57 on
  the deployed site). Never import app-only providers, `AuthGate`, or `lib/api`'s
  authed helpers from the root layout or any marketing/legal page. New authed
  routes go **inside `(app)/`**; new public pages stay outside and must not pull
  app chrome.
- **i18n bundles are code-split — four tiers** (`lib/i18n/`): `resources.ts` =
  **eager EN, public namespaces only** (common/auth/marketing/legal — SSR needs
  them synchronously); `resources.app.ts` = EN for the authed app
  (dashboard/billing/interview/project/stages/settings/admin/support), loaded by
  `loadAppNamespaces()` which **`AuthGate` awaits in parallel with `/auth/me`**
  (loading screen holds until both settle, so app pages never flash raw keys);
  `resources.share.ts` = EN for the **public share page** (`stages` + `share`
  only), loaded by `loadShareNamespaces()` which `SharedProjectView` awaits before
  its first render — a cold visitor following a share link must not pay for the
  dashboard's/admin's copy just to read a design; `resources.ar.ts` = **all
  Arabic**, loaded by `loadLocale('ar')` before `changeLanguage` (`<html dir/lang>`
  flips immediately; the text switch waits for the chunk). Every loader swallows
  failures → `fallbackLng`/keys, never a crash. **Only `client.ts` may import the
  `.app`/`.share`/`.ar` files, and only dynamically** — a static import anywhere
  folds ~240 KB of JSON back into every visitor's bundle. A new namespace goes in
  `namespaces` + the tier it belongs to (public → eager, app-only →
  `resources.app.ts`), and its AR file into `resources.ar.ts`.
- **Auth gating:** `AuthGate` (in the **`(app)` layout**) wraps the authed app.
  `/` and `/verify` are public (`PUBLIC_EXACT` / `PUBLIC_PREFIXES`);
  `/login`+`/register` are guest-only (signed-in users bounce to `/dashboard`);
  every other route shows the `AuthForm` when signed out. The app itself lives at
  `/dashboard`. Each AuthGate branch renders its own **`<main>` landmark** (the
  signed-in shell has a sibling `<header>`, so a root-layout `<main>` would nest
  landmarks); the landing page and `LegalDocument` carry their own. **The landing
  nav (`LandingNavActions`) makes no API call for anonymous visitors** — it only
  confirms `/auth/me` when the cached auth hint says "was signed in". The
  unconditional call meant every first-time visitor logged a 401 to the console
  (a Lighthouse Best-Practices point). The hint is cosmetic (which buttons to
  paint), not authorization — AuthGate and the server still gate everything.
- **Per-page access guard** (`lib/use-page-access.ts`). `usePageAccess(redirectFor)`
  fetches `/auth/me`, asks `redirectFor(me)` for a target, and `router.replace`s
  there (returning `null` meanwhile so nothing sensitive renders/flashes). This is
  a **UX guard only** — every protected API is independently permission-gated on
  the server, so a direct URL never leaks data; the redirect just avoids rendering
  a page the visitor can't use. Two factories: `requirePermission(perm, userFallback)`
  (staff lacking `perm` → `/dashboard`, regular users → `userFallback`) gates the
  admin/staff consoles; `customerOnly` gates the **customer** support area — staff
  are operators, not customers, so a support agent is sent to `/support/admin` and
  any other staff (e.g. a Billing Admin) to `/dashboard`. Applied across
  `/support/*` (customer + admin). The header **support link** in `AuthGate` is now
  shown to **customers only** (→ `/support`); staff navigate via the AdminShell
  sidebar.
- **Permission revalidation on focus.** Permissions resolve fresh server-side, but
  the client caches the last `/auth/me` in component state. So the **`AdminShell`
  sidebar** and **AuthGate** header re-fetch
  `/auth/me` on `focus` / `visibilitychange` / `pageshow[persisted]` (bfcache) and
  update `permissions`/`user` — a just-revoked permission's console/link disappears
  (and a granted one appears) on tab-return without a hard reload. Console *pages*
  already re-check on mount via `usePageAccess`, and every API is server-gated, so
  this is UX freshness, not the security boundary.
- Design system: Tailwind + shadcn/ui under `components/ui/`. Colors are HSL CSS
  vars in `globals.css` (light on `:root`, dark on `.dark`); theme toggled by
  `ThemeProvider`. Providers: Theme → Toast → Confirm → **Upgrade** → AuthGate.
- **Upgrade modal.** `UpgradeProvider` exposes `useUpgrade()` → `openUpgrade({feature?})`
  (mirrors `useConfirm`): a Promise that resolves `true` once the user is on Pro.
  It runs the checkout itself (mock activates instantly; Paddle opens the
  overlay). Trigger it anywhere a free user hits a Pro wall — the API-tab
  `UpgradeStage` and the dashboard quota banner both use it, then call
  `onUpgraded`/`refreshProjects` so the gated UI unlocks in place. `request()`
  throws a typed **`ApiError`** (`status` + server `code`) so callers can branch
  on `402`/`quota_exceeded` and pop the modal instead of showing a raw error.
- **Branding:** the logo lives in `components/shared/Logo.tsx` (`Logo` = mark +
  wordmark, `LogoMark` = inline SVG mark); the browser favicon is `app/icon.svg`.
  Raw brand SVGs (favicon/icon/full/mono) sit in `apps/web/public/` — keep
  `app/icon.svg` and `LogoMark` visually in sync. A `currentColor` SVG loaded via
  `<img>` does **not** inherit the page color (renders black), so theme-adaptive
  logos must be inlined, not `<img>`-referenced. The mark's geometry is
  deliberately **coarse** (2 thick strokes + 3 nodes, no sub-4px detail): the same
  shape is the 16px browser-tab favicon, and finer detail turns to mush there.
- **Site metadata / SEO (`lib/site.ts` + app file conventions).** `lib/site.ts` is
  the single source of truth for the machine-facing identity (origin, name,
  tagline, description, pipeline, brand colors, public routes) — consumed by the
  root `metadata`, the share card, the manifest, robots, and the sitemap. It is
  **not i18n'd**: crawlers and link unfurlers read it before any locale is known
  (locale lives in a client cookie), so it follows the same English-server-side
  convention as the rest of the machine-facing output. Everything else is wired by
  **file convention**, not by a `metadata.icons` key (see the Gotcha):
  `app/icon.svg` (favicon), `app/apple-icon.tsx` (180px PNG — Safari ignores an SVG
  touch icon, so it's redrawn through `ImageResponse`), `app/{opengraph,twitter}-image.tsx`
  (the 1200×630 share card, rendered by the shared `lib/og.tsx`), `app/manifest.ts`,
  `app/robots.ts` (auth-gated routes disallowed), `app/sitemap.ts`. **JSON-LD**
  (`SoftwareApplication` + `FAQPage`) is emitted from `app/page.tsx` — the *server*
  component — because `LandingPage` is a client component whose copy i18next
  resolves at runtime and so would never reach a crawler; its FAQ entries must stay
  in sync with `locales/en/marketing.json`.
- **Landing** (`components/marketing/`): a conversion-oriented public marketing
  page (`LandingPage`) structured as **Hero → Problem → Solution → What you get →
  Pricing → FAQ → Waitlist → Footer**. The Hero keeps the looping, auto-playing
  `IdeaToProductDemo` reel (client-only, respects `prefers-reduced-motion`) —
  treated as the page's "video" — and its **primary CTA is the product**
  (`/register`), not the waitlist: the app is live, so sending a ready visitor to
  an email form is the page's biggest leak. The waitlist keeps its own section for
  visitors who aren't ready. **"What you get"** (`DELIVERABLES`) is the page's real
  proof — a grid of the 12 artifacts with the Free/Pro cutline marked (mirroring
  `ProGuard`); without it the threat model, QA plan, cost estimate, diagrams, and
  scaffold are invisible to a visitor, since the Solution section only *describes*
  the output. Hero stats are **product facts, not social proof** (there are no
  honest customer numbers yet). Pricing reads plan numbers from `PLANS` (single
  source of truth) with copy/features from i18n; FAQ is a client accordion; the
  **Waitlist** posts to the real backend (`waitlistApi.join` → `POST /waitlist`)
  with a success/duplicate/invalid state machine. Fully i18n'd (`marketing`
  namespace, EN + AR, RTL-safe).
- **Landing chrome — sticky header + back-to-top.** The nav lives in its own
  `LandingHeader` (client) rather than inline in `LandingPage`, so per-scroll state
  only re-renders the bar. It is `sticky top-0 z-40` and **scroll-aware**: flush and
  near-transparent over the hero, then on `scrollY > 8` it takes a solid backdrop +
  border + shadow and tightens its padding, so it reads as a real toolbar instead of
  a strip overlapping the content. The **active section** is highlighted via an
  `IntersectionObserver` (not scroll math); `rootMargin: '-72px 0px -60% 0px'`
  discounts the header height and keeps exactly one link lit. `BackToTop` is a
  fixed, logical-positioned (`end-6` → RTL-safe) button that fades in past 600px;
  it stays mounted and animates opacity so it fades rather than pops, and is
  `tabIndex={-1}` + `aria-hidden` while invisible so a keyboard user can't focus an
  invisible control. **Anchor scrolling:** `html { scroll-behavior: smooth }` in
  `globals.css` is gated on `prefers-reduced-motion: no-preference`, and every
  anchored `<section>` carries **`scroll-mt-20`** — without it a sticky header
  covers the heading you just jumped to. i18n `nav.backToTop` (EN+AR).
  Nav/footer anchor to the section ids. Presentational except the waitlist form.
  The footer has a **Legal** column linking `/privacy` + `/terms`.
- **Legal pages + cookie consent.** Public `/privacy` and `/terms` routes (added
  to `AuthGate` `PUBLIC_EXACT`) render via one data-driven `LegalDocument`
  component from the **`legal`** i18n namespace (EN+AR, `returnObjects` sections
  array; RTL-safe). Content carries `[LEGAL_ENTITY]`/`[JURISDICTION]`/
  `[CONTACT_EMAIL]` placeholders to fill before launch; contact routes to the
  in-app Support Center. A **`CookieConsent`** banner (in `layout.tsx`, outside
  `AuthGate` so it shows everywhere) gates **analytics only** — essential cookies
  (auth/locale/theme) always run. Choice persists in `localStorage`
  (`archivato.cookieConsent`) via `lib/consent.ts`, which fires a window event so
  **`PageviewTracker`** starts/stops the beacon live (the analytics visitor cookie
  is only set after `accepted`). No consent → no `POST /analytics/track`.
- **Waitlist (`waitlist`).** A public, unauthenticated signup endpoint for the
  landing page (`POST /waitlist`, `HTTP 200`). `WaitlistService.join` is
  **idempotent** — email is normalized (trim+lowercase), a duplicate returns
  `{ok:true, alreadyJoined:true}` (never leaks prior signup; a unique-constraint
  race is swallowed to the same result). Repo pattern (interface + in-memory +
  Prisma `waitlist_entries`, unique email). Stores optional `locale`/`source`.
  `JoinWaitlistDto` validates the email. **Admin view:** a read-only
  `WaitlistAdminController` (`GET /waitlist/admin?q=&page=&pageSize=`, newest-first,
  email/source search, page ≤ 200) → `WaitlistAdminPage`, gated **Super-Admin only**
  via `admin:roles:manage` (same gate as the Roles console; WaitlistModule imports
  AuthModule for the guards). `WaitlistService.list()` maps entries to a client-safe
  `WaitlistEntryView`. Web: an `/admin/waitlist` page (KPI + debounced search +
  client-side CSV export + paginated table incl. a **Country** column) under the
  AdminShell route-group; a **Waitlist** item in the Platform nav group (i18n
  `admin.waitlist.*` / `nav.waitlist`, EN+AR).
- **Visitor geolocation (`common/geo.ts`).** `resolveCountryFromRequest(req)` derives
  a visitor's ISO-3166-1 **alpha-2 country**, hybrid + cheapest-first: a **CDN/edge
  country header** (`cf-ipcountry` / `x-vercel-ip-country` / `x-country-code` /
  `x-geo-country`) then an **offline `geoip-lite`** lookup on `req.ip`. `geoip-lite`
  is an **`optionalDependency` loaded via a lazy `require`** (try/catch) — behind a
  CDN the header short-circuits so the ~150 MB DB never loads, and a prod image
  built with `npm ci --omit=optional` degrades to header-only (no crash).
  `GEOIP_FALLBACK=false` force-disables the fallback. Placeholder edge codes
  (`XX`/`T1`/`EU`/…) normalize to null; the resolver never throws. Captured
  server-side on the **waitlist signup** (`POST /waitlist`) and the **pageview
  beacon** (`POST /analytics/track`) — only the country code is stored, never the
  IP. `AdminService.getTraffic` adds a **`topCountries`** breakdown (pageviews by
  country) shown in the analytics dashboard; the web `useFormat().country(code)`
  maps codes → localized names. Pure helpers (`normalizeCountry`,
  `countryFromHeaders`) are unit-tested.
- **Projects hub** (`ProjectsDashboard`): the post-login project list, presentational
  (all state/handlers come from `app/dashboard/page.tsx`). **Grid/list toggle**
  (persisted `archivato.projectsView`). Each project has an optional **`title`**
  (session column; `PATCH /interview/:id`, owner-guarded — the idea stays the AI's
  untouched source; cards show `title || idea`). A per-card **kebab menu**
  (`ProjectMenu`, rendered as a *sibling* of the open-button, never nested):
  **Rename** (inline input), **Direct Export** (JSON/Markdown/OpenAPI for confirmed
  projects — reuses the Pro `exportApi`; a 402 opens the upgrade modal, 409 hints to
  finish the pipeline), **Delete**. **Smart Resume**: the last stage tab viewed per
  project is saved (`archivato.lastTab:<uid>:<sid>` in `goToStage`) and restored in
  `openProject` (ProjectStages re-guards availability); a **Continue banner** resumes
  the most-recent project on that tab.
- **Activation / onboarding (sign-up → first artifact).** Three fixes attack the
  drop-off between sign-up and the first generated artifact (informed by a
  ux-consultant pass): (1) **Starter-idea chips** — `StarterIdeas` in
  `ProjectsDashboard` renders 5 concrete, tappable example ideas above the idea box
  (`lib/starter-ideas.ts` holds ids + scale; label/idea/industry are i18n
  `dashboard.starters.*`). Tapping **prefills** idea+industry+scale (still editable)
  so a first-timer never faces a blank textarea — chosen over an *abstract* template
  gallery ("SaaS/marketplace") which just moves the blank-page problem. Plus a soft
  `ideaTooShort` hint on the 10-char gate. (2) **Read-only Example project** — a
  persistent `ExampleBanner` opens `ExampleProjectView`, a tabbed **read-only tour**
  rendered from a **static fixture** (`lib/example-project.ts`, "HomeHelper" booking
  app) through the same artifact `*View` components. It previews **every agent**, in
  the same tab order + icons as the real `ProjectStages`: Interview summary, Vision,
  Requirements, Architecture, Database, API, Review, Roadmap, Cost, Security (STRIDE),
  QA Plan. **Diagrams/Canvas/Export are deliberately absent** — they render from a live
  session (`DiagramsView` fetches by `sessionId`), and the example is backend-free by
  design. The **cost estimate is not hand-written**: `EXAMPLE_COST_ESTIMATE` derives it
  from the example designs via the same pure `estimateCosts()` the real stage uses
  (same workload inputs as `CostEstimateService.generate()`), so the numbers can never
  drift from the fixtures they describe. **No backend call, no session, no quota
  impact** — it sells the payoff before the interview. `SystemDesignView` gained an
  `interactive` prop (default true; the example passes `false`) to hide the "Explain
  this decision" buttons, which would otherwise call the API on a non-existent
  session. Dashboard owns `viewingExample` state. In `ExampleProjectView.test.tsx`,
  `useLocale` is mocked (not `LocaleProvider`-wrapped) because `react-i18next` is
  already mocked out — the Vision + Cost views call `useFormat()`, which throws
  outside the provider. (3) **Quick wins** — the interview
  counter shows **"Question N of up to M"** (`INTERVIEW_MAX_QUESTIONS` in
  `@archivato/shared`, now the single source for the API's `MAX_ADAPTIVE_QUESTIONS`);
  the quota/upsell banner is **hidden on a zero-project account** (don't sell before
  any value is earned); and **confirming the interview auto-generates Requirements**
  (no redundant Generate click on an empty tab). i18n `dashboard.starters.*` /
  `dashboard.example.*` / `interview.questionN` (EN+AR).
- Confirmed project view = `ProjectStages` (tabbed, one stage per tab, downstream
  tabs disabled until prereqs exist). `app/dashboard/page.tsx` is the slim
  orchestrator. Above it, `ProjectWizard` is the single stage stepper (Interview →
  Export, `N/7 complete`), and takes `isPro` to lock the Pro stages + show the
  Free→Pro cutline. Don't add a second progress rail inside `ProjectStages`.
- **Command palette** (`⌘K`, `components/shared/command-palette.tsx`): the
  dashboard owns the toggle + builds grouped commands (Actions / Projects /
  reachable Stages) and passes them in; the palette is presentational + keyboard
  driven. Loading states use the `Skeleton` primitive, not bare spinners.
- Structured **editors** (PUT per artifact) **autosave** on a debounce via the
  shared `EditorBar` (`onAutosave` + a `dirty`/`canSave`/`savedAt` status pill:
  Unsaved changes · Saving… · Saved). Autosave routes through `onAutosaved` (not
  `onSaved`) so it persists + syncs parent state **without closing** the editor;
  `ProjectStages` sets `skipEditingResetRef` so the artifact-change effect doesn't
  treat the autosave as a restore. Dashboard `handleSaved*` take `{auto}` to stay
  silent (no toast/version bump) on autosave. Canvas saves stay manual. The
  leave guard still applies (`dirty` + `confirmLeave()` + `useConfirm`).

**CI (GitHub Actions).** `.github/workflows/ci.yml` runs on push/PR to
`develop`/`main`: one `checks` job — shared build → prisma generate → lint
(api + web) → unit tests (api + web) → api + web production builds. It needs no
services and no secrets: every repository has an in-memory implementation and
every agent has a deterministic fallback, so the suite is hermetic (no Postgres,
no Redis, no LLM key).

**There is deliberately no e2e/browser suite.** A Playwright full-funnel smoke
was built and then **removed**: it was flaky in a way that taught a real lesson
worth keeping. Playwright locators **auto-wait**, so any locator call inside a
polling predicate (`expect(...).toPass`) can park on an element that has already
unmounted — the interview's question counter vanishes the moment the completeness
gate closes — and it then burns the entire timeout without ever re-checking the
success condition, failing a page that is sitting there correct and ready. If a
browser suite is ever reintroduced: never call an unbounded `textContent()` /
`inputValue()` inside a retry predicate (give it a short explicit timeout, or use
`count()`, which resolves immediately), and prefer signals derived from
**server-confirmed state** over view-local state that an effect happens to reset.

## Gotchas (read before you trip on them)

- **Nothing on the landing page may auto-animate large regions or hold a network
  request open during initial load.** Two real incidents: the hero demo reel
  auto-advanced every 2.6s, so Lighthouse's filmstrip saw a big panel repainting
  deep into the trace → **Speed Index 6.8s on an otherwise sub-second page**
  (~10 Perf points) — autoplay is now **armed by the first user interaction**
  (8s passive fallback, reduced-motion never arms; real visitors notice no
  difference). And the pageview beacon, fired with stored cookie-consent against
  a **cold Render free instance**, dangled for the ~50s wake-up and held
  network-idle open (Lighthouse: "page loaded too slowly to finish") — it now
  carries a **4s `AbortSignal.timeout`**. Apply the same rules to anything new
  on `/`: animations must be interaction- or viewport-gated, and any beacon
  needs a timeout.
- **Never add an `icons` key to the root `metadata`.** Declaring `metadata.icons`
  **overrides the file-based icon conventions wholesale** — it does not merge with
  them. A lone `icons: { apple: '/logo-icon.svg' }` silently suppressed the
  `<link rel="icon">` that `app/icon.svg` would have emitted, so production shipped
  with **no favicon at all** and the tab fell back to the browser's default globe.
  Let `app/icon.svg` + `app/apple-icon.tsx` speak for themselves.
- **Satori (`next/og`) is not a browser — its CSS parser is far narrower, and it
  fails hard.** An unsupported value doesn't degrade; the edge route dies and curl
  reports `Empty reply from server` (no 500, no stack). Two rules for `lib/og.tsx`:
  radial gradients must use the **`circle|ellipse at <pos>`** form (the
  explicit-size `radial-gradient(1000px 620px at 12% 0%, …)` variant kills the
  render), and every element with **more than one child needs `display: flex`**.
  Only the bundled font ships, in **one weight**, so build hierarchy from size /
  color / letter-spacing — a `fontWeight: 700` renders as regular. Verify a change
  by actually fetching `/opengraph-image` and **looking at the PNG**; a byte count
  alone won't catch an invisible indigo-on-indigo logo.
- **`.env` `LLM_PROVIDER` must stay UNSET** to let `GROQ_API_KEY` flip the
  pipeline (an explicit `mock` forces mock). `apps/api/.env` is gitignored — the
  user pastes real keys there; confirm via the startup `LLM provider:` log.
- **"Templated / mock-looking artifacts" = the pipeline is on the mock provider,
  not a bug in the agents.** It means no real provider resolved (no key, or
  `LLM_PROVIDER=mock`, or `dev:api` started before the key was added), so every
  agent falls to its deterministic build. Fix = set `GROQ_API_KEY` (free) with
  `LLM_PROVIDER` unset and **restart `dev:api`**; the boot log must read
  `Agent LLM provider: groq`. The fallbacks are resilience, not the problem.
- **Windows:** stop `dev:api` before `prisma migrate/generate` (engine-DLL lock
  → EPERM).
- **Don't `next build` while `next dev` is running** (overwrites `.next` → dev
  500s). If it happens: `rm -rf apps/web/.next` and restart dev. To build/measure
  **without** stopping dev, use the knobs in `next.config.js`:
  `NEXT_DIST_DIR=.next-perf` (separate output dir, `.next-*/` is gitignored) +
  `NEXT_SKIP_STANDALONE=1` (skips the standalone copy step, which trips over
  Windows file locks from AV scanning; standalone only matters for Docker).
  Two side effects to know: `next build` **auto-rewrites `apps/web/tsconfig.json`**
  (reformats + adds `<distDir>/types` to `include`) — revert that, don't commit
  it; and local Lighthouse runs on this machine swing ±20 points between
  identical runs (dev server + AV load), so compare **medians of 3+, or the
  unthrottled desktop preset**, never a single throttled run.
- **Next only wires Tailwind/PostCSS at startup** — restart `next dev` after
  changing `tailwind.config.ts`/`postcss.config.js` or adding a new dep.
- **After editing `packages/shared`**, rebuild it
  (`npm run build --workspace @archivato/shared`) and restart `next dev` — web
  imports the built `dist`, not source.
- **`config.get<number>()` does NOT coerce** env strings; coerce numeric TTLs
  yourself (a string `expiresIn` is read as ms by jsonwebtoken).
- **Mermaid:** validate with `mermaid.parse(code, { suppressErrors:true })`
  BEFORE `render` (a parse error injects a persistent "bomb" SVG into `body`).
  Sanitize column *types* (spaces/parens break the ERD grammar).
- **Per-flow sequence diagrams.** `buildSequenceFlows(api, sys)` in
  `@archivato/shared` (pure/tested) emits one Mermaid `sequenceDiagram` **per API
  endpoint** (grouped by module), shaped by method + auth-module heuristics +
  cache/queue in the tech stack. `ProjectDiagrams.flows` carries them; the generic
  `sequence` `Diagram` stays as the "Overview". Capped at `MAX_FLOWS` (60). Web
  `DiagramsView` shows a grouped flow sub-picker only when the Sequence kind is
  active (`SelectLabel` was added to `components/ui/select.tsx`).
- **ER diagram export.** The ER diagram (`ErDiagram`) exports five formats, all
  client-side/offline: **Mermaid** (`.mmd`), **Draw.io** (`.drawio` editable
  mxGraph tables via `buildErdDrawio` in `@archivato/shared` — pure/testable),
  and **SVG / PNG / PDF** derived from the *rendered* Mermaid `<svg>` via
  `lib/diagram-export.ts` (`serializeSvg` adds an opaque backing rect from the
  theme-aware container bg; PNG rasterizes SVG→canvas at 2×; PDF opens a
  print-window with the inline vector SVG). No backend — everything derives from
  the already-loaded design + the DOM SVG. Draw.io/Mermaid are string builds;
  SVG/PNG/PDF read `container.querySelector('svg')` at click time.
- **OpenAPI export = JSON + YAML.** `ExportService.openapi()` builds the OpenAPI
  3.0 object (`openapi.builder.ts`); `openapiYaml()` serializes the same object
  with the pure `toYaml()` in `@archivato/shared` (`yaml.ts`, runtime-free/
  unit-tested — block style, quotes keys/strings only when ambiguous, so numeric
  status-code keys and `{id}` path keys come out quoted). Route
  `GET /export/:id/openapi.yaml` (`application/yaml`) sits behind the same
  `JwtAuthGuard + SessionOwnerGuard + ProGuard` as the rest of export; the `.yaml`
  literal segment doesn't collide with the `@All(':id/mock/*')` catch-all. Web:
  the Export panel has split **OpenAPI (JSON)** / **OpenAPI (YAML)** buttons
  (`export.openapiJson`/`openapiYaml`, EN+AR). Don't add a YAML dependency —
  `toYaml` is intentionally hand-rolled for the JSON-value subset.
- **Export also offers SQL / Postman / a "Download all" zip.** Two more pure
  builders in `@archivato/shared`: `buildSqlDdl(databaseDesign)` (`sql.ts` —
  runnable **PostgreSQL** DDL; FKs are `ALTER TABLE … ADD CONSTRAINT` *after* all
  `CREATE TABLE`s so table order never matters; unknown column types fall back to
  TEXT) and `buildPostmanCollection(idea, apiDesign)` (`postman.ts` — Collection
  v2.1, folder per module, `{{baseUrl}}` var, `:id` path vars + query params +
  schema-derived JSON bodies via `exampleValue`). Routes: `GET
  /export/:id/schema.sql` (`application/sql`), `/postman` (JSON), and
  `/all.zip` — the zip is built server-side with **`jszip`** (already a dep; same
  pattern as scaffold) from a **single `bundle()` fetch**, packing README.md +
  bundle.json + openapi.json/yaml + schema.sql + postman_collection.json +
  structure.json. Web `ExportView` adds a prominent **Download all** button
  (`saveBlob` for the Blob) + **SQL schema** / **Postman** buttons
  (`export.all`/`sql`/`postman`, EN+AR).

## Rules

- Build incrementally, one module/slice at a time; **ship backend + matching
  frontend** each slice so the user can click through and verify.
- Never skip DTOs, Guards, validation. Always use the Repository pattern.
- Environment variables for all secrets.
- **Ask before making architectural decisions.**
- After each slice, run `/security-review` + `/code-review` and fix findings.
- Keep `README.md` + this file updated per slice.
