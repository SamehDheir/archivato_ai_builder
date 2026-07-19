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
users). A **Proposal cover letter** then turns the finished scoping into the
message the owner actually submits with the link. Plus post-generation
**chat refine**, **version history**, **diagrams/canvas**, **auth**.

## Product positioning (2026 pivot)

Read **[docs/POSITIONING.md](docs/POSITIONING.md)** before any product/copy call —
it is the source of truth for who we sell to. Summary:

- **Customer:** owner/tech lead of a small MENA software house (3–20 people) that
  bids on client work — **not** developers learning architecture. That audience
  doesn't pay; this pivot (July 2026) is the response.
- **Message:** *turn a client call into a complete scoping package — requirements,
  architecture, cost, client-ready proposal — in one hour instead of one week.*
- **Differentiator = the "two-sided document":** one artifact the **client** can
  read (vision/cost/roadmap) and the **dev team** can use (OpenAPI/SQL/scaffold).
  So the share page leads with business artifacts and collapses the technical ones.
- **The share link stays FREE (watermarked for non-Pro)** — it's the growth loop;
  never re-gate it. Copy shifts from "project" to **client scoping** (EN+AR), and
  all educational framing comes out.
- **Order of work: Phase RED first** (landing rebuild · share=free+watermark ·
  client-facing share page · vocabulary · dashboard client-name/"sent" cards).
  Prefer small reversible changes that reuse existing infra over new engineering.

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
  `threat-model`, `qa-plan`, `proposal`, `export`, `share`, `projects`, `chat`, `jobs`, `stream`, `versions`, `diagrams`, `auth`,
  `billing`, `analytics`, `admin`, `support`, `notifications`, `roles`,
  `waitlist`).
  Modules export their repository token + service for downstream use.
- **Business Analysis (`business-analysis`) — the discovery layer, and the one
  stage built around what the model CANNOT know.** Runs off the confirmed
  interview, ahead of Requirements: problem statement, user segments,
  competitors, market read, USP, MVP-cut assessment, viability verdict. Free
  tier, owner-guarded, `THROTTLE_AI`, own `business_analyses` table (migration
  `20260719120000_add_business_analysis`). Nine things not to undo:
  1. **It FEEDS requirements; it does not gate them.** `RequirementsService`
     reads the analysis if one exists and passes it as context — the point of the
     stage is that the model reasons about the business before specifying
     software. But every project created before this existed has no analysis, and
     a hard gate would also make a BA failure block the whole chain. Pinned by a
     test that generates a document with no analysis at all.
  2. **Only the GROUNDED sections cross into the requirements prompt.** The
     brief carries problem / USP / segments / MVP assessment. The competitor list
     and market read are **excluded on purpose**: they are the analyst's
     unverified recollection, they say nothing about what the system must do, and
     the requirement document is what the *client* reads — letting them cross
     would launder a guess into a requirement. Pinned by a test.
  3. **`MARKET_HONESTY_RULES` is embedded verbatim in the system prompt** (the
     R13 `HONESTY_RULES` precedent, pinned by a test). There is no web access
     here, so competitors and market size are pure recollection. The rules ban the
     *specifics* — funding, valuation, revenue, user/customer counts, headcount,
     founding dates, market size in dollars — because those turn a plausible
     recollection into an authoritative-sounding fabrication, and they are exactly
     what a client checks first. Naming a product is allowed; claiming it raised
     $4M is not.
  4. **There is no market-size field to fabricate a number into.**
     `MarketAssessment` has `demandSignals` / `headwinds` / a qualitative
     `sizeNote` — deliberately no TAM. A dollar figure would be invented, would be
     the single most quotable line in the document, and would be wrong.
  5. **Every outside claim carries a `ClaimConfidence`**, and `toClaimConfidence`
     resolves anything unrecognized to **`unverified`**, never dropping it — the
     cautious direction (`parseBudget`'s "null, never a guess", applied to
     provenance of knowledge rather than of numbers).
  6. **`researchChecklist` is the counterweight that makes the rest shippable**,
     and `withResearchChecklist()` guarantees it covers every unverified claim —
     including the empty-competitor-list case, which is reported as *"this needs
     research"* rather than allowed to read as "there is no competition". It is
     folded into **`normalizeBusinessAnalysis()`**, which lives in
     `@archivato/shared` and runs at **both boundaries** (the agent on write,
     **both** repositories on read — Prisma *and* in-memory, so a unit test can't
     pass on a shape production repairs) — the `normalizeApiDesign` convention.
     That normalizer is also what stops `isValid` from being mistaken for a shape
     check: it only tests `problem.problem`, `segments` and `usp.statement`, so a
     conforming-but-partial response reached the view with `segments[].painPoints`
     and `usp.differentiators` undefined and took the whole tab out on `.join()`.
     **A required array must read as empty whether it is missing OR mistyped** —
     `?? []` is not enough, because a model answering `demandSignals: "strong
     demand"` passes the nullish check and dies on `.map`.
  7. **The deterministic fallback emits NO competitors and no market judgment.**
     Every other agent's fallback approximates the model; this one must not,
     because offline the code knows the interview and nothing else. It states the
     problem and segments (which it can), and says out loud that the market was
     not assessed. An install with no LLM key ships this for every project.
  8. **`stripMetrics()` is the backstop for when the prompt doesn't hold** —
     it removes money figures, user/customer counts and founding years from
     model-supplied competitor prose. The prompt is the primary defence; this
     costs a little fluency and removes a claim we cannot stand behind. Note the
     trap it shipped with: the replacement read `'a number of $2'` against a
     pattern with **one** capture group, so JS emitted the literal `$2` into a
     sentence the owner may forward to a client. The original test only asserted
     the *figure* was gone, never that the replacement read correctly — assert
     the output, not just the absence.
  9. **OWNER-ONLY, and there is no share-page counterpart.** The verdict is a
     judgement on the client's own business, delivered by the vendor they are
     paying to build it — a client must never read it. Nothing is added to
     `SharedProject`, which is stronger than redaction: there is no field to
     strip. **The verdict space deliberately has no `do-not-build`** (`proceed` /
     `proceed-with-changes` / `needs-validation` / `high-risk`), because this
     product's user is a dev shop scoping a project the client already decided to
     build — see [docs/POSITIONING.md](docs/POSITIONING.md) §2.
- **Standalone stages** generate from the session but don't gate, and aren't
  gated by, the design chain; each has its own artifact table + owner-guarded
  controller and is not in version snapshots. `product-vision` needs only the
  confirmed interview; `roadmap` and `cost-estimate` need the full pipeline
  (import the upstream design stores, 409 until the API design exists).
- **Derived-artifact freshness (`freshness.ts`).** Because the standalone stages
  hang off the design without gating it, **nothing regenerated them** when the
  design changed: a chat refine rebuilds requirements → system → database → API
  (+ review), and the user was then shown a roadmap / cost estimate / threat model
  / QA plan describing a design that no longer existed — with no indication
  anything was wrong. An edit (the editors **autosave**) or a version **restore**
  did the same. Fix: at generation time each derived artifact records the exact
  upstream revisions it was built from (**`sourceStamp`**, via `upstreamStamp()`);
  the web rebuilds that stamp from the current design and renders `StaleNotice`
  (warning + one-click regenerate) above any artifact where `isStale()` — no new
  API surface, since `ProjectStages` already holds every design artifact. Pure,
  runtime-free, shared by API and web. **Migration-free**: these tables store the
  artifact as `data Json`, so an optional field on the *type* is the whole change
  (the JSON-artifact convention below). Four things not to undo:
  1. **Compare for equality, not recency.** "Stale if an upstream is *newer*"
     misses a **restore**, which rewinds the design to an *older* revision under a
     newer roadmap — nothing is newer, yet the roadmap is wrong.
  2. **`generatedAt` is the revision marker** because every write path moves it —
     an agent run sets it, and `save()` (the editors) stamps a fresh one per edit.
  3. **An unstamped artifact is never stale.** Pre-existing rows carry no stamp
     and we cannot know their source; nagging every old project to re-run a
     **billed, Pro, LLM** stage on a guess would be worse than the bug.
  4. **`DERIVED_STAGE_SOURCES` mirrors the design inputs each service derives its
     *output* from** — the **cost estimate's figures come only from the designs**,
     so editing a requirement must not flag it. Change a service's design inputs ⇒
     change its entry. (Subtlety: R9's cost service *does* read the requirement doc,
     but only for the budget warning's out-of-scope **hint** — a boolean not worth
     flagging a whole deterministic estimate stale over — so `requirements` stays
     out of the cost stamp on purpose.)

  The banner lives on the tab that renders the artifact (Radix **unmounts inactive
  `TabsContent`**, so a stale *dot on the tab bar* would need the four panels'
  fetches lifted into the parent — deliberately not done). It's sufficient: exports
  and version snapshots don't carry these artifacts, so the tab is the only place a
  stale one can be seen.
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
- **Project economics — effort + budget + service subscriptions (R9).** The cost
  stage grew from "monthly hosting bill" into full project economics, still
  **100% deterministic (zero LLM calls)** — all new math is pure functions in
  `@archivato/shared` (`effort.ts`), reproducible and unit-tested. Additive: the
  existing `estimateCosts()` infra output is untouched for downstream/export
  compatibility. Three additive, optional fields on `CostEstimate`:
  1. **`effort: EffortEstimate`** (client-facing) — `buildEffortEstimate(design)`
     turns R8 module **complexity** (S/M/L/XL → person-week ranges via the tunable
     `EFFORT_MODEL` constant) + **build-vs-buy** into a person-week range. A "buy"
     capability collapses its matching module to integration-only work
     (`buyIntegrationFactor` 0.25×; a flat 0.5–1 wk line when it maps to no module);
     "build" keeps full weight. Fixed items layer on the build subtotal (project
     setup 1 wk flat, QA 20%, DevOps 1 wk flat, buffer 15%). **Everything rounds to
     0.5 wk.** A module with no complexity defaults to M.
  2. **`serviceSubscriptions: ServiceCostLine[]`** (client-facing) — one monthly SaaS
     line per build-vs-buy "buy" from the static `SERVICE_COST_HINTS` table; unknown
     price ⇒ `null` + `usage-based`/`unknown`, **never a misleading $0** (the LLM-
     metering convention). When a target market is known, the payments line carries a
     regional PSP fee note from `REGIONAL_SERVICES` (`resolveRegion`) — **dormant for
     now**, since no `target_market` slot exists yet (it degrades to no note, tested
     via the pure builder).
  3. **`budgetWarning: BudgetWarning | null`** — **OWNER-ONLY.** `buildBudgetCheck`
     warns only when `budget_range` parses (`parseBudget` is tolerant: "$5k",
     "5000-8000", Arabic numerals; **null, never a guess, on junk**) AND `effortMax ×
     REFERENCE_RATES.lowUsd` exceeds the budget top by **>25%**; `links` point at the
     R8 phased MVP + R7 out-of-scope when they exist. **The share `view()` strips it
     to `null` server-side** (same enforcement as any owner-only field — the payload
     IS the security boundary; a security test asserts it never reaches the public
     page).
  - **Owner pricing input.** An optional nullable **`weeklyRate`** on the session
    (Prisma `Float?` + migration `20260715160000_add_weekly_rate`; entity + both
    repos + `UpdateProjectDto` + `ProjectSummary`, owner-scoped). Set via `PATCH
    /interview/:id`; the authenticated cost page computes a **suggested price** range
    (`computeSuggestedPrice` = effort × rate) labeled *"internal — not shown to your
    client"*. **The share page never receives `weeklyRate` or the price** (it's on the
    session, never projected; the price is computed only where the rate exists). The
    owner's JSON download namespaces them under `internal: {...}`.
  - **Rendering.** `CostView` gains owner-only props (`weeklyRate` + `onSaveWeeklyRate`,
    threaded dashboard→ProjectStages→CostEstimatePanel); owner order = effort →
    suggested price → budget warning → infra → service subscriptions. The **share
    page passes neither prop** and its payload carries no `budgetWarning`, so it shows
    only effort + infra + service subscriptions. i18n `stages.cost.{effort,price,
    budget,services,infra}.*` (EN+AR, Arabic numerals via `useFormat`). The example
    fixture derives `effort`/`serviceSubscriptions` from the same builders so it can't
    drift.
- **Review = engineering health + deal risk (R10).** The Reviewer gained a fifth
  axis and a consistency layer, both **additive/optional** on `ReviewReport` (old
  rows render fine):
  1. **`scores.clientReadiness` + `clientReadinessIssues[]`** — a *deal*-risk lens,
     not an engineering one: ambiguous requirements a client could read two ways,
     unbounded scope ("any report the client requests"), undocumented assumptions,
     executive-summary promises with no backing functional requirement, missing
     out-of-scope coverage. Each finding carries a **`suggestedResolution`** enum
     (`add_open_question | add_out_of_scope | tighten_requirement | align_summary`)
     + a short instruction. **Resolution is manual — rendered as guidance; auto-apply
     is deliberately not built.**
  2. **`consistencyFindings[]`** — cross-artifact contradictions, each naming the two
     artifacts that conflict and tagged **`source: 'automated' | 'ai'`** so the UI can
     distinguish a code check from the model's judgment. The **deterministic** layer is
     `buildConsistencyFindings()` (pure, `@archivato/shared`): effort-vs-timeline,
     constraint-vs-`constraintCompliance` coverage, build-vs-buy "buy" vs a
     matching cost line, and **scope integrity** (below). The **LLM** layer adds its
     own (forced to `source:'ai'`).
     - **Scope integrity** compares `requirements.outOfScope` against everything the
       package *promises* — functional requirements, services, API groups
       (`promisedCapabilities`, assembled in `ReviewService`). It catches the
       contradiction a client finds first: "you said mobile apps weren't included,
       but the plan lists them", which costs the dev shop the argument because the
       exclusion is the only thing between them and building it for free.
       Matching runs over `PromisedCapability.text` (**title AND description**),
       not `label`: a requirement's title is a headline ("Billing and Payments")
       while the contradicting capability hides inside the sentence ("…and manage
       insurance claims"), and matching titles alone missed exactly that on a real
       project. The finding still quotes the short `label`, so widening the
       haystack never drags a paragraph into what the owner reads.
       **The matching bar is the whole design.** `describesSameCapability` requires
       **two** shared distinctive tokens (`SCOPE_MATCH_MIN_TOKENS`) after
       `SCOPE_STOP_WORDS` strips the filler; one shared word fires on any project
       that excludes *payouts* while taking *payments* — a distinction the document
       draws deliberately — and a check that cries wolf teaches the owner to mute
       the whole panel. A single-token exclusion ("Telemedicine") is the one case
       that may match on one word. **Deliberately conservative: a miss falls through
       to the reviewer's LLM pass; a false positive tells an owner their own document
       contradicts itself when it doesn't.** Pinned by tests, including the
       near-miss ("Mobile Apps Gateway" is an API gateway, not the native apps).
     - **Constraint coverage compares tokens, not substrings.** The original
       `cc.includes(key) || key.includes(cc)` test could not see that the design's
       *"integration with payment gateways and accounting software"* addresses the
       requirement's *"The platform must integrate with existing payment gateways
       and accounting software"* — `integrate with existing` is not a substring of
       `integration with`. On a real two-constraint project **both** findings it
       produced were false. `constraintIsAddressed` now ORs containment with
       `describesSameCapability`; containment stays because it is genuine evidence
       and it covers constraints too short to yield tokens at all (`PCI DSS`).
     - **`namesExcludedCapability` is a THIRD matcher, and the split is deliberate.**
       Comparing a reviewer-coined label ("Telemedicine functionality") to the
       document's own wording ("Telemedicine / live video consultations") is not the
       same question as comparing two phrases: they share one word, which the
       two-token bar rightly rejects for phrase-vs-phrase and wrongly rejects here.
       So that check tests **containment** — every distinctive word of the feature
       name appears in the exclusion — which is a strong claim that cannot fire on a
       partial overlap. Don't collapse the three matchers into one.
  Five things not to undo:
  - **`overallScore` is COMPUTED, never taken from the model.** The prompt asks for a
     number "consistent with the four engineering sub-scores" and the model does not
     reliably give one — a real report scored 80/60/70/50 and reported 70, where the
     average is 65. `normalize()` now always calls `this.overall(scores)`. The
     headline number on a document a client reads has to be arithmetic, not a claim.
     (`isValid` still gates on the model *supplying* a score — that's a "did we get a
     real report back" signal, not the source of the number.)
  - **`missingFeatures` excludes what the document deliberately excluded.** The model
     notices telemedicine isn't in the design and reports it missing, while the
     requirement doc's out-of-scope section says in the client's own words that it
     isn't included — so the review told the owner their scoping had failed at
     exactly the point where it worked. `withoutExcluded` filters via
     `namesExcludedCapability`.
  - **`clientReadiness` does NOT feed `overallScore`.** Overall stays the 4-dimension
     *engineering* average, so the public number survives redaction unchanged and
     keeps meaning what it always meant.
  - **The whole deal-risk lens is OWNER-ONLY.** `redactReviewForShare()` (pure, in
     `shared`) empties `clientReadinessIssues`/`consistencyFindings`/`clientReadinessNote`
     and deletes `scores.clientReadiness`; `ShareService.view` runs it — same
     enforcement as R9's `budgetWarning` (**the payload IS the boundary**; a security
     test asserts none of it reaches the public page). The *engineering* findings still
     cross — the review lives in the share appendix.
  - **The fallback still ships the axis.** Offline it emits a **neutral 70** +
     `clientReadinessNote` ("needs an AI pass"), because deal risk needs LLM judgment —
     but the **automated consistency findings are pure code and are always included**,
     on both paths. `ReviewModule` imports `CostEstimateModule` only to read the cost
     estimate's `serviceSubscriptions` for check 3.
  - **The buy-vs-cost-line check keys off `serviceSubscriptions` being *undefined* vs
     `[]`.** Undefined = no cost estimate to compare against ⇒ skip; a present-but-empty
     array is a real signal. Comparing against a freshly-computed `buildServiceCostLines`
     would be circular (both derive from `buildVsBuy`) — the point is catching a **stale**
     stored estimate.
- **Review findings → applied fixes (R11).** R10 gave each client-readiness finding
  a `suggestedResolution`, but resolution stayed *prose*: the owner read "tighten
  this requirement" and did it by hand, so the findings most worth acting on were
  the least likely to be acted on. R11 closes the loop. Additive/optional on
  `ReviewFinding` (JSON-blob convention, migration-free): `id`, `actionType`
  (`patch | needs_client | advisory`), `patchTarget {stage, sectionHint}`, `status`
  (`open | resolved | converted | dismissed`), `statusNote`. Logic lives in
  `review.fix.ts` (pure, `@archivato/shared`), which imports `review.ts`
  **one-way** — the reverse would give the barrel a runtime cycle. Non-negotiables:
  1. **No silent auto-fix.** Every mutation is proposed → previewed → explicitly
     approved → applied. `ReviewFixService.propose` calls the model and **writes
     nothing**; only an owner-approved `apply` writes. There is deliberately no
     "fix all", and no path from a draft to a write that skips the preview.
  2. **`PATCH_SECTIONS` is a CLOSED set, on one test:** a section qualifies only if
     a model can regenerate all of it in **one response** AND rewriting it can't
     invalidate its neighbours. That's why **`api-design.modules` is not patchable**
     — that artifact provably doesn't fit (its own generator chunks at 4 entities
     because the ceiling is 2048 tokens), and a truncated API design parses *short*,
     silently dropping endpoints. `system-design.services` is out because rewriting
     it moves complexity → effort → **the price**; `database-design.*` cascades into
     the API, SQL export, and scaffold. Findings landing there are `advisory` — the
     owner is told what's wrong and left to drive it, which is honest. Widening the
     set means proving the new section passes **both** halves, not adding a key.
  3. **The PatchAgent is the ONE agent with no deterministic fallback**, and that's
     the design. Every other agent falls back because a templated artifact beats no
     artifact; a *patch* is the inverse — a guessed rewrite of a document a client
     reads is worse than an honest "couldn't generate a fix", since the owner still
     has the finding. `validateFixProposal` is strict and never coerces or salvages
     a partial batch (a partially-applied fix is a document nobody reviewed).
  4. **Downstream = the EXISTING staleness system, not a new cascade.** A patch
     stamps a fresh `generatedAt`, the derived stages' `sourceStamp`s stop matching,
     and `StaleNotice` offers the one-click regenerate it already had. A
     requirements-only patch must **not** drag the cost estimate stale
     (`DERIVED_STAGE_SOURCES`) — pinned by a test.
  5. **The fixLog lives on the SESSION** (`fixLog Json?`, migration
     `20260716120000_add_fix_log`), not the review: a re-run **replaces** the review
     row and the review **is** in version snapshots, so a restore would rewind a log
     stored there. An audit log a restore can rewind is not an audit log. It carries
     **`findingTitle`** because it outlives the report — after a re-run the id points
     at nothing, and "resolved security:0" is not a record anyone can read.
  6. **A re-run resets every status to `open`** — it's a fresh assessment; a genuinely
     fixed issue simply stops being reported, and the delta (`60 → 78`) shows the win.
  7. **`needs_client` writes the REQUIREMENT DOC ONLY, never `session.openQuestions`.**
     R6's invariant is that the session's slots/openQuestions are a *derived cache*
     always re-derivable from `history[]`; a question the reviewer inferred from the
     finished documents has no transcript turn behind it. (The session is also
     `confirmed` by then — exactly when `editSlot` stops accepting writes.) Accepted
     trade-off: a requirements **regen** re-derives from the transcript and drops
     them; the finding is still in the review and can be re-converted.
  8. **The workflow is OWNER-ONLY.** `redactReviewForShare` now also strips `id`/
     `actionType`/`patchTarget`/`status`/`statusNote` from every finding that *does*
     cross, so the share payload is byte-identical to pre-R11 — a client must never
     learn which risks their vendor waved away. A security test asserts a dismissal
     note never reaches the public page.
  9. **`normalizeReviewReport` runs at BOTH boundaries** (the agent on write, the
     store on read — Prisma *and* in-memory). The read side is what gives a pre-R11
     row ids and action buttons instead of leaving it inert forever; `row.data as
     ReviewReport` is a claim, not a check.
  Classification: `RESOLUTION_ACTION` maps R10's four enums (`add_*` → needs_client,
  `tighten_requirement`/`align_summary` → patch on requirements); `DIMENSION_ACTION`
  is the per-dimension default (**security → `requirements.nonFunctional`**, since a
  security finding is nearly always a missing NFR; scalability/performance →
  `system-design.techStack`; **cost → advisory**, as there's no artifact section that
  states "right-size compute"). The **deterministic fallback classifies each finding
  at its source** (the code knows what it built), so offline runs get real buttons.
  API: `POST /review/:id/fix/{propose,apply,client-question,out-of-scope,advisory}` +
  `GET /review/:id/fix-log`, all owner-guarded + `ProGuard`; only `propose` is
  `THROTTLE_AI` (the only one that calls a model). The proposal round-trips through
  the browser and is **re-validated server-side** — safe because the caller is the
  owner, who can already PUT anything via the structured editors, so the risk is a
  malformed *shape*, not an untrusted author. Patches write through
  `RequirementsService.applyPatch` / `SystemDesignService.applyPatch` (each service
  owns writes to its own artifact); `applyPatch` is separate from `save()` because
  `save()` deliberately carries the narrative sections over — exactly what a patch to
  one of them must overwrite. Metering is automatic (`BaseAgent.thinkJson` stamps
  `agent`; the route's first path segment gives stage `review`). **Web:** `ReviewView`
  gains `sessionId` — **its presence is what enables the actions**, so the share page
  and example project render the same component read-only (the `SystemDesignView
  interactive={false}` precedent; the server's redaction is the boundary that counts).
  `FixPreviewModal` shows a **real before/after** — `currentContent` is read off the
  artifact **server-side**, never the model's description of it, because the owner
  approves what they are shown. `fix-preview.ts` renders sections as readable lines
  (raw JSON would make them diff punctuation instead of judging wording). i18n
  `stages.review.fix.*` (EN+AR); the three `count` keys carry the **full Arabic CLDR
  plural set**.
- **Optional extended artifacts (R12) — `generateExtendedArtifacts`.** The threat
  model and QA plan are **Pro, LLM-billed, and slow**, and they're the two a small
  fixed-price job least often needs: offering them by default on a $4k build made
  the tool feel heavier than the deal. They're now **opt-in per project**, via one
  `Boolean @default(true)` column on the session (migration
  `20260716140000_add_extended_artifacts`) — the default is what makes this a
  **zero-behaviour-change** slice for everything already created. Rules:
  1. **Unknown means yes.** `defaultExtendedArtifacts(slots)` (pure,
     `extended-artifacts.ts`) flips to `false` only when `budget_range` **parses**
     and its **top** is ≤ `EXTENDED_ARTIFACTS_BUDGET_THRESHOLD` ($10k, one edit
     site). Missing / unparseable / `na` ⇒ **true** — the `parseBudget` "null, never
     a guess" rule. Silently withholding a security analysis because we misread a
     sentence would be the worst failure here, and invisible. It reads the range's
     **top** so a "5k–12k" project (which can stretch to the assurance work) stays on.
  2. **`null` on the column = "the owner hasn't decided"**, and that marker is the
     whole design: `resolveExtendedArtifacts(stored, slots)` derives **on read**
     while it's null, so the toggle tracks a `budget_range` the owner **corrects at
     the gate** — `editSlot` sits directly above it. (The first cut wrote the derived
     default to the row once, inside `advance()`; the toggle then couldn't react to
     the correction, which broke the feature for exactly the user who bothered to
     state a budget. Deriving on read deleted that code path rather than adding to
     it.) A non-null value is the owner's explicit choice and no slot edit overrules
     it; **`confirm()` pins one**, so every confirmed project carries a definite
     answer instead of one that depends on re-parsing a sentence. Two migrations,
     both needed: the first added the column `NOT NULL DEFAULT true` — which is what
     **backfilled every pre-R12 row to an explicit `true`** — and the second dropped
     the default + NOT NULL so only *new* rows start undecided.
  3. **Off ⇒ cleanly absent, never stale.** The artifacts are simply never
     generated, so `isStale()` reads a missing artifact as fresh — no new pipeline
     state, no new gating mechanic. `EXTENDED_TABS` are **hidden** from the nav (not
     disabled: a disabled tab invites a click that does nothing), and `available`
     *and* the dashboard's duplicate `stageAvailable` map both AND-in the flag —
     the **command palette navigates by key too**, so "unlisted" isn't "unreachable".
  4. **The share payload enforces it server-side**, not the absence alone:
     `ShareService.view` nulls both when the flag is off, so an owner who generated
     them and *then* opted out doesn't put them in front of a client.
  5. **Activation reuses `PATCH /interview/:id`** — no endpoint, no new state. The
     quiet "Generate security & QA artifacts" link (muted, under the tabs, only once
     an `apiDesign` exists) flips the flag; each stage then generates on demand as
     it always did, so nothing else re-runs.
  **Absence-tolerance audit (R12): nothing needed fixing.** `ExportService` never
  included them; the review's consistency checks read effort/timeline/constraints/
  buildVsBuy/serviceSubscriptions only; version snapshots deliberately exclude them;
  `ProjectsService`'s artifact booleans don't cover them. The share page already had
  `?? null` + `{threatModel && …}` — because both are **Pro stages a free owner
  never has**, so R12 inherited that tolerance for free.
- **Proposal cover letter (R13) — `proposal`.** The scoping package was complete
  and the deal still wasn't submitted: the owner had a link and a blank message
  box, and the covering message is what decides whether the link is ever opened.
  This closes the loop. A standalone **Pro** stage (full-pipeline gate: 409 until
  the API design exists) that writes the message a dev shop pastes into
  Mostaql/Upwork/email *alongside* the link, generated from the scoping itself:
  R7's `executiveSummary` + top capabilities, R9's deterministic effort range,
  R10's phase-1 MVP statement, the `timeline` slot, and the share URL.
  `ProposalWriterAgent` + a deterministic fallback (`buildFallbackProposal`, pure,
  in `@archivato/shared/proposal.ts`). Nine things not to undo:
  1. **The message is signed by the USER, not by us** — that is what makes it
     different from every other agent's output. Hence `HONESTY_RULES` (shared,
     embedded verbatim in the system prompt, **pinned by a test**): never past
     experience, years in business, team size, portfolio, past clients,
     credentials, or superlatives about the sender. An LLM writing a "cover
     letter" reaches for that register by default — "with over a decade of
     experience delivering…" — and every word of it would be invented, in a
     document the owner signs and a buyer may check. The message speaks ONLY about
     this proposal's content.
  2. **The model never invents a price.** `includePrice` defaults **false**, and
     the enforcement is *structural*: `ProposalControls` (the form) guards the
     price behind the flag; the service resolves it into `ProposalInput`, where a
     price is either **present or does not exist**. The prompt cannot leak a figure
     it was never handed — so the test asserts the figure is absent from the
     **prompt**, not that the model behaved. A stale value left in the form after
     unticking the box is unreachable.
  3. **The price is FREE TEXT, inserted verbatim** — not `{min, max, currency}`.
     Prefilled from R9's `computeSuggestedPrice` × `weeklyRate` (formatted exactly
     as the Cost tab shows it) and always editable. This market quotes in several
     currencies and attaches terms ("fixed, 3 milestones") a structured shape can't
     carry, and the owner's exact words are the one thing we must not re-derive.
  4. **Ceilings are enforced in CODE, and truncation is never allowed.**
     `PROPOSAL_CEILINGS` (one file): upwork 900 · mostaql 700 · email 1200 ·
     generic 900 — platform realities, not style. Over the ceiling ⇒ **one** retry
     quoting the real overshoot; still over ⇒ keep the **shorter** of the two and
     show it with a warning chip. A message cut at 900 chars ends mid-thought, and
     the owner — who asked for something ready to send — may not re-read it. Their
     judgement about what to lose beats our substring. (The *fallback* composing a
     shorter message via its `BUDGETS` ladder is not truncation: every rung is a
     complete message that says less, and the link, the opted-in price, and the
     closing question never fall off any rung.)
  5. **Arabic output here is DELIBERATE, and is not the deferred GREEN item.**
     Generated *artifacts* stay server-side English. This isn't an artifact — it's
     the owner's outbound message to their client, and a Mostaql bid written in
     English is a bid that loses. `CHANNEL_DEFAULT_LOCALE`: mostaql→ar, upwork→en,
     email/generic→the project locale; always user-overridable.
     **Known limit:** because the artifacts are English, the *offline fallback* in
     Arabic mixes Arabic chrome with English scope text. The LLM path translates
     naturally, so this only shows in mock/demo mode; fixing it properly is the
     GREEN "Arabic generated artifacts" item — a deterministic fallback cannot
     machine-translate.
  6. **Drafts live on the SESSION** (`proposalDrafts Json?`, migration
     `20260717120000_add_proposal_drafts`), capped at 5 by `appendProposalDraft` —
     the R11 `fixLog` precedent, for the same reason: version snapshots rewind
     design artifacts, and a restore must never rewind a message the owner already
     sent. They are an **outbox, not an artifact**, so newest-first (unlike the
     audit-log `appendFixLog`) and no table/repo of their own. The cap lives *in*
     the helper because an uncapped JSON column grows one LLM-length message at a
     time.
  7. **Generating mints the share link** via the idempotent `ShareService.create`.
     An owner asking for the message that says "the full scoping is here: <link>"
     is unambiguously about to send it; `create` never rotates a link already in a
     client's inbox, so the only alternative was a step existing purely to make the
     code feel side-effect-free.
  8. **Owner-only, end to end.** Nothing touches the public share payload — a
     client must never learn how their vendor pitched them, what price was floated,
     or which drafts were binned. There is no public counterpart to any of it.
  9. **`session.clientName` is NOT defaulted server-side.** The web prefills the
     form field from it and sends what the owner *confirmed*; a silent fallback
     would add nothing but a path by which a dashboard label reaches a prompt
     unseen. This keeps R5's invariant intact — no **design** agent reads it — with
     the proposal writer as the one owner-confirmed exception, since the message is
     addressed to that person.
  Effort is recomputed with `buildEffortEstimate` (never read from a stored cost
  estimate) so the owner can't quote a client a stale figure — the roadmap's rule.
  API: `POST /proposal/:id/generate` (`ProGuard` + `THROTTLE_AI`) + `GET
  /proposal/:id/drafts`, both owner-guarded. Metering is automatic (`thinkJson`
  stamps `agent: proposal_writer`; the route's first path segment gives the stage).
  **Web:** `ProposalModal` — the draft lands in an **editable textarea** (the
  model's job is to kill the blank page, not to have the last word; copy takes what
  is *on screen*), with a char counter vs the ceiling, "Try a different angle" (an
  incrementing `variant`, which rotates the fallback's hook/closing too, so
  regenerate changes something offline as well), and **the link shown separately**
  because Upwork/Mostaql put links in their own field. Entry points: the project
  header (once `apiDesign` exists) and the Export "Send to client" card (R12).
  i18n `stages.proposal.*` + `project.proposal.*` (EN+AR); history keys use `{{n}}`,
  not `count`, to dodge the Arabic CLDR-plural trap.
- **Roadmap = effort-grounded phases (R10).** Additive/optional on `RoadmapPhase`:
  `moduleNames`, `weeksMin`/`weeksMax`, `isMvp`, `mvpStatement`, plus
  `alternativeRoadmaps` on the roadmap. The rule that holds it together:
  - **The LLM groups modules; the CODE computes every week number.** The prompt
    explicitly forbids durations, `mapPhases` **drops any effort the model emits**, and
    `buildPhaseEffort(phases, effort)` (pure, `shared`) fills the numbers: each phase =
    the sum of its `moduleNames`' effort lines + a share of the fixed pool (setup, QA,
    DevOps, buffer, flat integrations, and any module no phase claimed — so no weight is
    lost). Allocation is proportional to build weight **with a per-phase baseline of 1**,
    so an overhead-only phase (Hardening) still gets a fair slice of QA/DevOps instead of
    zero. `totalEstimate` likewise comes from the effort estimate, never the model.
  - **No effort estimate ⇒ no week numbers** (`weeksMin`/`weeksMax` stay undefined and
    the view falls back to the legacy `effort` string) — the pre-R10 behavior, kept as a
    regression test.
  - **Phase 1 is always the MVP** (`ensureMvp` enforces it on both paths) with a
    `mvpStatement` backfilled from **R8 `phasedArchitecture.mvp`** when present, else the
    `core_workflows` slot, else a generic line.
  - **Dual roadmap only on a real conflict.** The service pre-checks
    `hasTimelineConflict(effort.weeksMin, timeline)` — the **low** end, so a conflict means
    even the best case blows the deadline — and only then asks for
    `alternativeRoadmaps {withinDeadline, fullScope, excludedFromDeadline}`; `normalize`
    drops them if they weren't requested. **The fallback never produces one** (it needs
    LLM judgment); the conflict surfaces as the review's automated effort-vs-timeline
    finding instead. `TIMELINE_CONFLICT_TOLERANCE` (1.1) is shared by both features so
    they can never disagree about when a timeline is unrealistic.
  - **`parseTimelineWeeks` handles Arabic units** (`٦ أسابيع`, both hamza spellings), not
    just digits — the timeline slot holds the *client's own words*, and this product's
    market states deadlines in Arabic. Unparseable ⇒ **null, never a guess** ⇒ no conflict.
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
  design into a **runnable app** — a NestJS + Prisma API, a Next.js client, or
  both. Like the cost estimator, the generation is **fully deterministic — no
  LLM**. Three pure builders in `@archivato/shared` (runtime-free):
  `buildBackendScaffold()` (`scaffold.ts`), `buildFrontendScaffold()`
  (`scaffold.frontend.ts`), and `buildScaffold(input, target)`
  (`scaffold.compose.ts`) which picks between them. `ScaffoldTarget` =
  **`backend | frontend | fullstack`**, and **fullstack is the default** — it
  re-roots the two halves under `apps/api` + `apps/web` with a root
  npm-workspaces `package.json` (the shape Archivato itself is built in). The
  two builders stay unaware of each other: composing is a path re-rooting plus
  three root files, so the single-target outputs are byte-for-byte what they
  always were. Both builders derive their names from **one `assignHandlers()`**
  (`scaffold.util.ts`) — that's *why* the frontend client's `create()` calls the
  backend controller's `create()`, rather than two files happening to agree.
  - **Backend:** DB entities/relations → `prisma/schema.prisma`; API
    modules/endpoints → NestJS modules/controllers/services + class-validator
    DTOs. FKs are scalar fields + a `// FK →` comment (never Prisma relations,
    which could be invalid), service methods are typed stubs that throw "Not
    implemented", exactly one `@id` is guaranteed (a flagged PK, else a promoted
    `id` column, else a synthesized one — never a duplicate), and colliding
    module/entity names are uniquified. `main.ts` **enables CORS** for
    `WEB_ORIGIN` (default the frontend's port) — without it the generated client
    can't call the API it ships with.
  - **Frontend:** a typed client (`lib/api/<module>.ts`, one function per
    endpoint, over a single `apiFetch` in `lib/api-client.ts`) + a page per
    module: list wired to the collection GET, a create form from the POST body
    schema, and a detail/edit page from GET/:id + PUT/:id.
  - **"It compiles" is only true if you RUN the compiler on the output.** Both
    halves are verified by generating a project from a hostile design and running
    `tsc` (api **and** web) + `next build` on it. That is not ceremony — it is the
    only reason three shipped bugs were caught: required DTO fields were emitted as
    `email: string` (fails **`strictPropertyInitialization`/TS2564** — the backend
    scaffold had **never** compiled for any DTO with a required field; it's `!` now),
    `qs()` took a `Record` an interface can't satisfy, and the item type came from
    the detail response instead of the richest one. Re-run it after touching a
    builder.
  - **Correctness over richness** (same bar as the backend — the output must
    compile, and it's verified by actually running `tsc` + `next build` on it):
    item fields are **all optional** (they come from the *designed* response
    schema, not a running API, so a page must render when one is absent); list
    responses are unwrapped defensively (`Array.isArray(data) ? data : []`);
    design text (module names, summaries, the idea) is embedded in JSX as a
    **JSON-encoded string expression**, never raw JSX text, because LLM output
    contains quotes and braces; a `*/` in a summary is escaped so it can't end a
    doc comment; and only endpoints with a single trailing `:param` get wired to
    pages — a nested or **tenant-scoped path** (`/api/:tenant/reports`, whose
    param is invisible to the module-relative subPath) still gets a typed client
    function, but no invented UI and **no reference to a variable that was never
    declared**. Two traps worth remembering: `qs()` takes `object`, not
    `Record<string, unknown>` (a generated `*Query` **interface** has no implicit
    index signature and would not be assignable); and the item type comes from
    the **richest** designed response, not the detail one (a detail endpoint
    often returns fewer fields than the list it belongs to).
  - **The design is untrusted input to a code generator.** Artifacts are LLM
    output derived from the user's own words, and they land *inside* generated
    string literals (`'${path}'`, `@Controller('…')`, `method: '${m}'`), file
    paths, comments, and Prisma `@map("…")`. A quote, backtick, `$`, or newline
    there breaks out of the literal it sits in — the generated project stops
    compiling (the one promise these builders make), and in the worst case
    carries code the user never wrote into their own repo. Three chokepoints in
    `scaffold.util.ts` hold the line, and **every generator must go through
    them**: `safePath()`/`stripApi()` reduce a path to an inert charset
    (`SAFE_PATH_CHARS`), `httpMethod()` whitelists the verb (it's emitted as both
    a decorator name and a string literal), and `mapName()` strips quotes from a
    Prisma map. Plus `oneLine()`/`comment()` for text going into a `//` or `/** */`
    comment. Not cross-tenant (it's your own design, on your own machine), which
    is why it's a *correctness* guarantee first — but don't hand-roll a fourth
    path of design-text-into-source without one of these.

  - **Deployment artifacts (`scaffold.deploy.ts`).** Every scaffold also ships a
    **Dockerfile per app + `docker-compose.yml` + a GitHub Actions workflow +
    `DEPLOY.md`**, plus a real provider config where one honestly exists:
    `render.yaml`, `fly.toml`, `railway.json`, `Procfile`+`app.json`,
    `.do/app.yaml`, `vercel.json` (`DEPLOY_CONFIGURED`). Deterministic, no LLM.
    Generated in **`scaffold.compose.ts`, not the two builders** — only that layer
    knows the final layout (`apps/api/` vs the repo root), and a Dockerfile has to
    point at the app it actually builds. `?provider=`/`{provider}` (`@IsIn` → 400
    on junk); omit it for the default.
    - **AWS and Cloudflare deliberately get NO config.** A real AWS deploy is
      account-specific infra (a CDK/Terraform stack) and Cloudflare's compute is
      **Workers, which a long-lived NestJS server doesn't run on at all**. They
      fall back to the Docker path (which genuinely works) and DEPLOY.md says so.
      Shipping an unrun CDK stack would be the confidently-wrong output this repo
      refuses everywhere else.
    - **The default provider is NOT `estimate.recommended`.** `recommendedProvider()`
      takes the cheapest among **`DEPLOY_CONFIGURED`**, because the estimator prices
      all eight as if any could host the design and on small workloads picks
      **Cloudflare** (infeasible, above) or AWS — so inheriting it would hand every
      user the Docker fallback instead of the config this stage exists to produce.
      *(The estimator recommending an infeasible host is its own bug, in its own
      stage — deliberately not papered over here.)*
    - Three traps, each of which broke a real deploy and now has a test: the web
      `CMD` must bind **`${PORT:-3001}`** (Render/Heroku *assign* the port; a
      hardcoded one is a container nothing can reach); `healthCheckPath` must point
      at a route that **exists** (the generated backend gained
      `health.controller.ts` → `/api/health`, else Render 404s it unhealthy
      forever); and Render's `WEB_ORIGIN` must **not** use `fromService: property:
      host` — that yields a bare hostname with no scheme, and CORS compares full
      origins, so every browser request would be blocked. Also: `NEXT_PUBLIC_*` is
      inlined at **build** time, so it's a Docker build **arg**, never a runtime env.

  The `ScaffoldService` reuses `ExportService.bundle()` (so it inherits the
  "pipeline complete through API design" 409 gate). Owner-guarded + `ProGuard`
  (mirrors export); GitHub routes throttled (`THROTTLE_EXTERNAL`). `target` rides
  in on `?target=` (`ScaffoldQueryDto`, `@IsIn` → a **400 on junk**, not a silent
  fallback to a different artifact) and on the push body. Delivered two ways:
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
- **Public share links (`share`).** A read-only page for a design that anyone can
  open with no account — the product's organic loop. One `share_links` row per
  session (repo pattern; `sessionId` PK, unique `token`, `viewCount`).
  The token is **32 CSPRNG bytes base64url** and is the link's only credential.
  Owner routes (`/share/:sessionId`, `JwtAuthGuard + SessionOwnerGuard`): `GET`
  (link or null), `POST` (mint), `DELETE` (revoke). `create` is **idempotent**
  (sharing twice never invalidates a link already sent out); **revoke is a hard
  delete**, so the token dies for good and re-sharing mints a new one (there is no
  "pause").
  - **Sharing is FREE on every plan — do not re-gate it.** It was originally
    Pro-only and that was backwards on two counts: the public page is what brings
    *new* visitors in, so paywalling it taxed exactly the free users doing our
    marketing; and it was unreachable anyway — the button lived in the (Pro)
    Export tab and the route's gate came from `ExportService.bundle()`, which 409s
    until the **API design** exists, itself a Pro stage. So a free plan + a Pro
    gate on the pipeline would just be a button that always 409s. Three things had
    to move together, and all three must stay moved: no `ProGuard` on the mint
    route, share owns its **own gate** (`ShareService.readDesign` — its own reads
    of the design stores, 409 until the **database design** exists, which is
    exactly the free tier's floor), and the control sits in the **project header**,
    not in Export. Share is therefore **no longer a subset of export** and
    `ShareModule` imports the upstream design stores directly (the roadmap/cost
    precedent) rather than `ExportModule`/`BillingModule`. **Export stays Pro** —
    that's the deliverable the customer keeps; the link is the one they hand out.
  - **`SharedProject.apiDesign` and `.review` are nullable** because of the above:
    both are Pro stages, so a free owner's link legitimately carries neither and
    the page renders the design it has (the tab and the stat tile disappear). Every
    consumer must tolerate that — the public page, **`generateMetadata`**, and the
    **OG card** (`ShareOgFacts.endpoints` is optional). Show *nothing* rather than
    `0 endpoints`: a zero reads as a claim about the design instead of about the
    plan that generated it. Losing only the API design is likewise **not** a
    regression any more (a live link keeps working and drops the tab); the 404 case
    is a design that rewinds *below* the database design.
  - **The shared page is a CLIENT PRESENTATION, not a technical document** (the
    2026 client-scoping pivot — see [docs/POSITIONING.md](docs/POSITIONING.md)). The
    reader is the person whose idea it is, deciding whether to sign — they cannot
    read an ERD, and an OpenAPI table tells them nothing. So `SharedProjectView`
    is ordered the way a buyer reads: **vision → requirements → cost → roadmap**,
    with **architecture / database / API / review / threat model / QA plan collapsed
    below** in a "Technical details" appendix (individual `Collapsible` rows, *not*
    tabs — a tab strip says "pick one of these", which is the wrong invitation for a
    client). The header is the **project's own name** + the client's one-line idea
    + three tiles they actually ask about (features in scope, timeline, running
    cost). `generateMetadata` follows: `title:{absolute}` = the project name (the
    root layout's `%s · Archivato` template is bypassed — the proposal is the
    *owner's* document, not ours), description = a **locale-aware** one-line
    "Software scoping proposal …" (`PROPOSAL_TAGLINE`, EN+AR — the one machine-facing
    string that IS localized, because the audience is a person in WhatsApp/email, not
    a crawler), **not** `"modular monolith · 5 services · 12 tables"`. Two traps: the
    header must **not** repeat `vision.vision` (ProductVisionView already opens
    with it — printing it twice one screen apart reads as a copy-paste slip), and
    the lead is skipped when `title === idea` (an unnamed project's title *is* the
    idea).
  - **The watermark is the server's call, from the OWNER's plan** — the growth
    loop's price on an otherwise-free feature. `SharedProject.watermark` is set in
    `ShareService.view` via `billing.planFor(session.userId)` →
    `shouldWatermarkShare(plan)` (free ⇒ watermark, pro ⇒ clean); the page only
    *renders* the flag (`{project.watermark && <Watermark />}`). **Never a
    client-side plan check** — the page is public, so anything the browser decides,
    a browser can skip. Read the plan at *view* time, not mint time, so a downgrade
    (or a lapsed Pro period) re-watermarks links already out in the world. Use
    `BillingService.planFor` (**read-only**, never `getOrCreate` — the public read
    must not write a subscription row for every anonymous visitor); a null/owner-less
    session is free. `ShareModule` imports `BillingModule` **only** for this read —
    it is emphatically *not* a `ProGuard` on the mint route.
  - **The public payload IS the security boundary.** `GET /shared/:token`
    (separate `SharePublicController`, so a token can never collide with a session
    id on the route table) returns strictly `SharedProject` (`@archivato/shared`):
    the design chain + the client-facing artifacts (**`vision`, `costEstimate`,
    `roadmap`** — all optional) + optional review + **`threatModel` / `qaPlan`**
    (Pro, appendix) + a server-set **`watermark`** boolean + the title/idea — **no
    interview transcript** (the user's own words about their business), no owner,
    and **not even the session id**. Widening it to the three client-facing
    artifacts was deliberate: the vision is *derived from* the interview but **is
    not** the interview — it's a structured artifact the owner reviewed and chose to
    send, whereas the raw transcript never leaves the session. They are **additive
    and never gate** the link (the floor is still the database design), so a free
    owner's link carries `vision` (a free stage) but `costEstimate: null` /
    `roadmap: null` / `threatModel: null` / `qaPlan: null` (Pro) and the page drops
    those sections rather than showing an empty one. `ShareModule` therefore imports
    `ProductVisionModule` / `CostEstimateModule` / `RoadmapModule` /
    `ThreatModelModule` / `QaPlanModule` for their repo tokens. Every artifact is stamped with `sessionId`, so the
    projection **overwrites it with the token** — an internal id that addresses
    owner-scoped routes has no business on a public page. A design that later
    regresses below the shareable floor (a version restore rewinds past the
    database design) 404s rather than surfacing the 409 a stranger couldn't act on.
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
    **project header** (`ProjectStages`, rendered once `dbDesign` exists — the same
    floor the API mints against): create/copy/views/revoke, with no upgrade path,
    since there is no 402 to catch any more.
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
- **API Design = guaranteed entity coverage.** The stage's promise: **every entity
  in the database design gets an endpoint group, or a declared reason it doesn't**.
  Nothing enforced this before — the prompt mentioned entities in passing and no
  code ever checked the result — so a model that grouped its modules around
  *services* quietly shipped tables with no API, and the only signal was a user
  noticing a missing resource later. Additive/optional on the artifact (JSON-blob
  convention, migration-free): `coveredEntities?: string[]` + `source?:
  ApiModuleSource` per module, `excludedEntities?: {entity, reason}[]` top-level.
  Three pure, unit-tested pieces in `@archivato/shared` — `api-design.coverage.ts`
  (`validateEntityCoverage`, `withResolvedCoverage`, `mergeMissingCoverage`) and
  `api-design.rest.ts` (`buildRestApi`, `ensureEntityCoverage`). The flow:
  LLM → resolve → validate → **one repair call** for the gap → `ensureEntityCoverage`
  in the service. Things not to undo:
  1. **The invariant lives in `ApiDesignService.generate`, not the agent** — it is
     the only path that writes a generated design (the SSE stream calls it too), so
     `ensureEntityCoverage` there is what makes "can't persist an uncovered entity"
     true rather than best-effort. `save()` deliberately only *recomputes* coverage:
     re-adding a group the user just deleted would make the editor feel broken.
  2. **Coverage is declared OR inferred from paths.** Declaration-only would treat a
     perfectly good undeclared `/api/orders` as missing and send the repair pass off
     to build a **second** Orders resource — duplicates are worse than the paperwork
     gap. Inference only counts segments **before the first path param**: reading
     `/api/customers/:id/orders` as "Customers covers orders" would let one nested
     read route stand in for the whole orders API. An explicit `coveredEntities`
     still buys nested-only coverage.
  3. **Only `generated-fallback` is a warning.** It marks a group the *code* built
     because the model left an entity uncovered even after repair. A wholesale
     deterministic design (mock mode / failed call) is **not** tagged — that's the
     expected offline output, and flagging every group would make the chip
     meaningless.
  4. **Chunked generation is the truncation fix** (`MAX_ENTITIES_PER_CALL = 4`).
     The API design is the largest artifact here and the default output ceiling is
     **2048 tokens on Groq/Azure**, 4096 on Claude — a 10-entity design doesn't fit,
     and a cut-off response either fails to parse or parses *short*. Chunks merge in
     code; a failed chunk contributes nothing and its entities fall through repair →
     fallback, so an outage costs precision, never coverage. Don't "fix" this by
     raising `maxTokens`. Every call (incl. repair) goes through `thinkJson`, so
     **usage metering is intact**.
  5. **A chunk may only excuse its own entities.** Unscoped, a chunk that excluded a
     *later* chunk's entity would satisfy the validator on its behalf — and if that
     chunk then failed, the entity would end up with no API and a reason nobody
     designed.
  6. **Junction tables are excluded, with nested routes on the PARENT's module.** A
     pure join table (≥2 FKs and nothing else of its own — `order_items` with a
     `quantity` is a real resource, `post_tags` is not) gets no resource; the parent
     carries `/api/orders/:id/order_products`. Nested routes must hang off the
     parent's group because the scaffold mounts a group's endpoints under its own
     basePath — the same path declared in `Orders` would generate `/orders/:id/orders`.
  7. **Code enforces that a reason exists, not that it's a good one.** The prompt
     narrows the valid reasons (junction / internal table / nested-under-a-named-parent);
     the validator can't judge prose.
  8. **Endpoint paths are forced ABSOLUTE (`absolutePath`).** The type says
     `/** Full path including the /api prefix */` and nothing enforced it, so models
     broke it constantly — one real design mixed **three** conventions, twice inside
     a single module: `/api/clinics` for the collection but `/:id` for the item,
     `/` and `/:appointmentId` in the next group, and correct absolute paths only
     where the deterministic builder had filled in. Every consumer trusts this
     field, so the blast radius is the whole stage: the OpenAPI export publishes
     `/{id}` as a root route, the scaffold mounts a controller in the wrong place,
     and the Postman collection points at nothing. Because normalization runs at the
     store's **read** boundary too, this repairs designs already in the table. Two
     details: a relative path that repeats its own resource (`/orders/:id` under
     `/api/orders`) is de-duplicated rather than joined into
     `/api/orders/orders/:id`; and that comparison is **segment-wise, never a RegExp
     built from `basePath`** — that string is LLM output and may carry metacharacters.
  9. **A public registration endpoint may not accept role/permission/tenant ids.**
     A real design shipped `POST /api/auth/register` taking `role_id` and
     `clinic_id` in the body — anyone could register as an administrator. The threat
     model flagged privilege escalation only in the abstract, because it was reading
     the same artifact that contained the hole.
  10. **A list endpoint is QUERYABLE, not merely paginated.** Both paths used to emit
     `page`/`limit` and nothing else — the prompt said so in as many words, so the
     model was doing what it was told. `listQueryParams(entity)` (pure, in
     `api-design.rest.ts`) now derives the rest **from the entity's own columns**:
     `search` (only when a non-secret text column exists), the lifecycle column
     itself, a `<date>_from`/`_to` range (prefers `created_at`, else any domain
     timestamp), and one filter per FK, capped at `MAX_FK_FILTERS`. The LLM prompt
     asks for the same set in the same naming convention, so the two paths agree.
     Three things worth keeping: on a GET, `requestSchema` **is** the query string
     (`openapi.builder.ts` maps it to `in:'query'`), so these flow to OpenAPI,
     Postman, and the scaffold for free — no new type; a `password`/`token`/`hash`
     column is **never** exposed as a filter; and the nested child-collection
     endpoint **drops the parent's FK filter**, since the path already pins it.
     This costs ~5 schema fields per entity, which narrowed the chunking margin —
     see `MAX_ENTITIES_PER_CALL`, and lower it before raising `CHUNK_MAX_TOKENS`.
- **Database design = lifecycle, linkage, isolation, and real-world completeness.**
  Prompt rules on the Database Designer, several previously true only of the
  *deterministic fallback* (which emitted `status` on invoices/notifications while
  the LLM path had no such rule — the offline output was cleaner than the model's).
  Each one comes from a real generated schema that shipped without it:
  - **Lifecycle `status`.** An entity that moves through states carries an enum
    `status`; one that never transitions deliberately does not. A clinic schema
    shipped `appointments` with no status at all — while its own Product Vision
    named *"Appointment No-Show Rate < 10%"* as the headline success metric. The
    vision promised a number the database could not produce. Pairs with the
    list-query rule above: the `status` column is what makes the filter derivable.
  - **Secondary records link to the transactional event**, not merely to `user_id` —
    medical records and prescriptions hung off `patient_id`/`doctor_id` with no
    `appointment_id`, so no diagnosis could be traced to the visit that produced it.
  - **Multi-tenant means EVERY table, not just `users`.** The same schema put
    `clinic_id` on `users` and on nothing else, in a product whose whole premise was
    *"providers operating multiple clinics"* — every patient, bill and record was
    queryable across tenants. That is also the threat model's own #1 critical
    threat, which it never traced to this cause.
  - **No unique constraint on a shared contact field.** `patients.phone @unique`
    breaks the first family that shares a number. Uniqueness belongs on a national
    ID or account number.
  - **An audit-log entity** whenever the requirements restrict who may read or
    change records, or name a regulated data category — the same schema had a
    business rule and a repudiation mitigation both demanding one, and no table.
- **Agents backfill via `normalize()`.** Where an artifact has many optional
  parts (e.g. the reviewer's per-dimension scores/findings), the agent trusts a
  valid LLM response but fills any omitted field deterministically, so the shape
  is always complete. New optional fields on a JSON-stored artifact need
  defensive defaults in consumers (view + markdown export) for old rows.
  - **A write-side `normalize()` can never reach a row that is already in the
    table — so the JSON store's READ is a boundary too.** Artifacts persist as
    `data Json` and come back through `row.data as unknown as X`: **the cast is a
    claim, not a check**, and a row written before a normalization rule existed
    still violates the type it is cast to. This is not hypothetical — an API design
    stored without `statusCodes` (a **required** field) 500'd the OpenAPI export
    with `ep.statusCodes is not iterable`, and it would equally have taken out
    Postman, the scaffold, the mock server, and the view, because all of them trust
    the type. Fixed the only way that heals an existing row: **`normalizeApiDesign()`
    is applied in `PrismaApiDesignRepository.findBySessionId`**, one chokepoint that
    every consumer reads through — *not* a `?? []` sprinkled into each builder
    (~8 sites, and the next consumer forgets). The rule is **one pure helper in
    `@archivato/shared`, called at both boundaries** (the agent on write, the store
    on read) so the two can't drift. **A missing array must read as empty, never as
    undefined.** When a required field on a JSON-stored artifact starts arriving
    absent, fix the read — not the crash site.
- **Repository pattern everywhere.** Every store has an interface + in-memory
  impl (used by unit tests, DB-free) + Prisma impl. Feature modules provide the
  Prisma repo.
- **Billing / project quota.** Capacity is a **projects-created-per-calendar-month**
  rate (dollars are plan prices): **Starter = 1 design/month**, **Team = unlimited**
  (**$79/mo** or **$758/yr — 20% off**).
  - **The tier names are display-only.** The ids stay `free` | `pro` — that is what
    every subscription row, `isPro`, `ProGuard`, `effectivePlan`, the Paddle mapping,
    and the admin console key on. `PLANS[plan].name` is the label ("Starter"/"Team");
    **rename the label, never the id.** Tier names are product brands, so they are
    read from `PLANS` rather than i18n and are identical in every locale.
  - **`projectQuota: number | null`, where `null` = unlimited** — never `0` (which
    would block everything) and never a large number standing in for "no limit"
    (which a later edit could accidentally enforce). Callers must **skip** the check
    via `isUnlimitedQuota`, not compare against a sentinel.
  - **The quota period is the UTC calendar month** (`startOfQuotaPeriod` /
    `countInQuotaPeriod`, pure, in `shared`). Both sides must agree on where the
    month starts: the server's 402 and the client's "used X of Y". If each used its
    own local clock they would disagree across a timezone boundary and a user would
    be told they had a design left and then refused — hence one shared UTC rule,
    used by the enforcement *and* the banner.
  - **Known accepted hole:** the meter is still the project list (no usage table),
    so a **deleted project stops counting** and a Starter user can delete-and-retry
    within a month. Not a regression (the old owned-count quota behaved the same)
    and it costs them the design they delete. Closing it needs creations recorded
    somewhere that survives the delete. Pinned by `project-quota.spec.ts`.
  - **The landing page reads its price from `PLANS`** (`lib/landing.ts` →
    `TEAM_PRICE`). It used to be an independent literal, and the two promptly
    drifted — the page advertised $79/mo + "unlimited designs" while billing charged
    $19/mo for 5 projects. A pricing page that disagrees with the checkout is worse
    than one that can't be freely edited. The tier *structure* still lives in
    `landing.ts` (billing has no "Agency" tier to sell — it is **not built**, per
    POSITIONING §4.5); the number a customer reads is the number they are charged.
    **To reprice, edit `PLANS` — one file.**

  **Annual is a cadence, not a tier:** an orthogonal
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
  at **project creation** (`InterviewService.start`:
  `repo.countByUserIdCreatedSince(startOfQuotaPeriod())` vs
  `BillingService.getProjectQuota` → **402 `quota_exceeded`** when the month's
  allowance is spent; skipped entirely when the quota is `null`). At the cap you
  wait for the next month or upgrade. Deliberately simple: **no per-confirm
  consumption and no usage table** — the project list *is* the meter, so the UI
  computes "used" from the projects created this period (`createdAt` on
  `ProjectSummary`; billing only returns the quota/limit).
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
  design** (plus Product Vision, **plus the public share link** — see `share`:
  the growth loop is deliberately unpaywalled); **Pro is required to generate the
  API design and everything after it — AI review, roadmap, cost estimate, and
  export.**
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
- **LLM transport: timeouts + retries (`llm-http.ts`).** One shared
  `postLlmJson()` behind the three OpenAI-shaped providers (Groq / Azure /
  SiliconFlow), which all POST and read the same shape. It exists because
  **Node's `fetch` has no default timeout**: a hung upstream held a BullMQ worker
  or an open SSE connection *indefinitely*, and on a 512 MB instance a handful of
  those is an outage. Every attempt now carries its own `AbortSignal.timeout`
  (fresh per attempt — a signal only fires once). Five things not to undo:
  1. **The retry is at the PROVIDER layer, never on the BullMQ job.** Every agent
     catches its own LLM failure and returns its deterministic fallback, so
     `service.generate()` **resolves** and the job **completes** — `attempts` on
     the queue would be dead config that never fires. And if it ever did fire,
     `PipelineProcessor` writes a version snapshot per run, so a retry would
     re-persist the artifact and cut a second snapshot. This layer is the only one
     where a transient 503 is still visible *as* a transient 503.
  2. **Why retry at all:** the fallback makes a blip invisible. Before this, one
     503 from Groq meant a **Pro user paid for an LLM-generated artifact and
     silently received the templated one**, with nothing in the document saying so.
     (Making that visible is a separate, still-open item — see the C2 provenance
     stamp in [docs/IMPROVEMENT-PLAN.md](docs/IMPROVEMENT-PLAN.md).)
  3. **Only transient failures retry.** `isRetryableStatus` = 408 / 429 / 5xx,
     plus timeouts and undici's `TypeError('fetch failed')`. A 400/401/403/404
     fails identically on every attempt, so retrying only delays the fallback and
     burns latency. **`LlmJsonParseError` is never retried here** — it happens
     *after* the HTTP call, in `parseJsonFromLlm`, and is not a transport fault.
  4. **Claude is CONFIGURED, not wrapped.** The Anthropic SDK already retries with
     backoff and already has a timeout — but its default ceiling is **ten
     minutes**. It gets the same budget via `timeout` + `maxRetries`; wrapping it
     in `postLlmJson` would nest two retry loops and multiply the worst case.
  5. **A reasoning model gets `REASONING_TIMEOUT_FACTOR` (2x).** R1 spends real
     wall-clock thinking before it writes (which is also why it gets
     `REASONING_HEADROOM_TOKENS`); holding it to the standard ceiling would abort
     calls that were about to succeed — turning a slow answer into no answer.
  6. **`LlmHttpError.kind` (`http | timeout | network`) is how callers classify a
     failure — never a regex over `err.message`.** `degradedReasonFor` needs the
     timeout/outage distinction (it becomes the artifact's `degradedReason`), and
     deriving it from prose built in `llm-http.ts` meant a reworded string would
     silently reclassify every timeout. Two more traps closed with it: only
     undici-shaped `TypeError`s (`'fetch failed'` or carrying a `cause`) count as
     network faults — treating *every* TypeError as one retried genuine code bugs
     three times and reported them as outages; and `timeoutMs` is clamped to
     `MAX_LLM_TIMEOUT_MS`, because past 2^31-1 ms a Node timer overflows and fires
     **immediately**, so an over-large value aborted every call at once.
  Config is `LLM_TIMEOUT_MS` (default 90s, **per attempt**) + `LLM_MAX_ATTEMPTS`
  (default 3 = one call plus two retries), read through `readLlmHttpConfig()`,
  which **coerces explicitly** — `config.get<number>()` does not, and a string
  handed to `AbortSignal.timeout` misbehaves silently. Metering note: a timed-out
  attempt may still have been billed upstream but reports no usage (usage is read
  off a response we never received), so retries **under**-report spend rather than
  over-report it — the honest direction for a margin meter.
- **Generation provenance (`generation.ts`) — degradation has to be VISIBLE.**
  Every agent falls back deterministically, which is what makes the pipeline
  resilient; the cost is that a degraded artifact is indistinguishable from a
  real one. A Pro user paid for an LLM-generated API design, one transient
  failure handed them the template, and **nothing in the document said so** —
  they then forwarded it to a client. Additive/optional `generation?:
  GenerationProvenance` (`{mode, provider, model, degradedReason?}`) on the nine
  LLM artifacts (requirements · system · database · api · review · vision ·
  roadmap · threat · qa), JSON-blob convention, migration-free. Seven things not
  to undo:
  1. **The stamp is applied by ONE template method, `BaseAgent.generateArtifact`.**
     Eight agents had byte-for-byte the same try/validate/catch/fallback shape,
     so they were refactored onto it rather than hand-stamped — provenance each
     agent sets by hand is provenance the ninth agent forgets. A new agent gets an
     accurate stamp for free. The API designer keeps its own flow (it **chunks**,
     so it has several success paths) and stamps via the exposed
     `this.provenance()`; per-module attribution already lives on `ApiModule.source`.
  2. **`mode` records what the agent DID WITH the output, not whether HTTP
     succeeded.** A 200 carrying JSON that fails `isValid` is `fallback`, because
     the artifact the user receives was built by the code.
  3. **The mock provider is degraded even on the `llm` path.** `MockLlmProvider`
     returns parseable JSON, so a scripted response can pass `isValid` and be
     stamped `llm` — it is still not AI output. `isDegradedGeneration()` ORs
     `mode === 'fallback'` with `provider === 'mock'`, so that judgment lives in
     one pure function instead of in every agent.
  4. **An unstamped artifact is NOT degraded.** Rows written before this existed
     carry no stamp and we cannot know how they were built; warning on a guess
     would nag every old project into re-running a **billed, Pro, LLM** stage.
     Same rule as an unstamped `sourceStamp` never being stale.
  5. **`parse_error` is deliberately distinct from `call_failed`.** It is the
     expensive one — the model call **succeeded and was billed**, and only the
     JSON was unusable — so it points at the prompt or the model, not the network.
  6. **A (re)generation REPLACES the stamp; a human edit PRESERVES it.** That
     one rule covers every write path, and each half was wrong once: the chat
     **refine** spread `...ctx.current` and inherited the old stamp (so a doc
     refined during an outage still read "AI-generated"), while `save()` dropped
     it entirely (the global `ValidationPipe` runs `whitelist: true`, so the
     client's payload never carries it) — meaning one edit silently erased the
     warning. The refine now re-stamps with its own outcome; every `save()` calls
     **`preserveGeneration(edited, existing)`**, which also closes the forgery
     path by taking the stamp from the *server's* row rather than the request.
     Editing one sentence of a document the model never wrote does not make it
     AI-written.
  7. **Provenance is OWNER-ONLY.** `withoutGeneration()` runs in
     `ShareService.view` on every artifact — same enforcement as R9's
     `budgetWarning` and R10/R11's deal-risk fields (**the payload IS the
     boundary**). It tells a client their vendor's proposal was machine-templated
     and names our provider and model; neither is theirs. A security test asserts
     no `generation` and no `degradedReason` reaches the public page.
  8. **The cost estimate is NOT stamped, on purpose.** It is 100% deterministic
     (`estimateCosts`, zero LLM calls), so a "generation mode" on it would be
     meaningless at best and would imply LLM involvement at worst. Same for the
     scaffold. `DerivedArtifact` was therefore *not* the home for the field —
     `CostEstimate` extends it.
  **Web:** `GenerationNotice` (mirrors `StaleNotice` — renders **nothing** when
  healthy, missing, or unstamped, so callers mount it unconditionally above the
  artifact) on all nine tabs, with a one-click regenerate. The regenerate action
  is optional, so the share page and example project render read-only. i18n
  `stages.generation.*` incl. a per-reason message (EN+AR).
- **LLM usage metering (`llm/usage`) — margin protection.** Every model call made
  through the `LlmProvider` seam is recorded: provider, model, **agent**, stage,
  user, session, tokens, cost, ok/failed, duration. One `llm_usage` row per call
  (repo pattern; append-only, **no FK**, so it outlives the user/session). It stores
  **counts only — never prompt or completion content** — so a role holding just
  `admin:analytics` (no project access) can safely report on it.
  - **Cost is deterministic — no billing API, no LLM.** `estimateLlmCostUsd()` in
    `@archivato/shared` (`llm-usage.ts`, runtime-free/tested) prices a call off a
    per-model catalog (`MODEL_PRICING`, published list prices). Matching is
    **exact**, with one narrow relaxation — a **dated snapshot** id
    (`…-20250101`) prices off its base model. It deliberately does **not**
    prefix-match in general: that would price `gpt-4o-realtime-preview` (pricier)
    off `gpt-4o`, and a *confidently wrong* number is worse than an honest
    unknown. Cache multipliers are **per-model, not universal** — Anthropic
    discounts a cached input token 0.1× (and surcharges a cache write 1.25×) but
    **OpenAI/Azure discount it only 0.5×**, so the `gpt-*` entries override it;
    getting that wrong understates Azure spend ~5×. **An unlisted model returns
    `null`, not 0** — tokens are recorded with a null cost and both the totals AND
    **each breakdown row** carry `unpricedCalls`, so a row can render "—" instead
    of a confident `$0.00` (a blank $0.00 next to real traffic is worse than
    useless in a tool whose whole job is margin protection). Prices drift: **edit
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
    handed the email list as a side effect. Cost-per-call divides by
    **`billedCalls`** (calls that actually consumed tokens), not by `calls` —
    mock/failed calls in the denominator would halve the apparent unit cost. Web:
    `LlmUsagePanel` on `/admin` (i18n `admin.llm.*`, EN+AR) + `useFormat().usd()`
    (sub-cent precision below $1 — rounding a fraction-of-a-cent call to `$0.00`
    would make spend read as free).
  - **Per-user cost-to-serve (the users table).** `AdminUserRow.aiSpend`
    (`UserAiSpend`: calls/tokens/costUsd/unpricedCalls) puts **what a user costs us**
    next to what they pay us, so a free account burning real money is visible in the
    directory rather than only in an aggregate. It is **lifetime, not 30-day** — the
    windowed view already exists in the panel, and cumulative burn is the whole point
    of a per-user figure. Symmetric to the email rule above: the spend fields are
    populated **only for a caller who also holds `admin:analytics`** (`null`
    otherwise, and the web column hides itself), so a directory-only role gets rows
    without costs. Unlike `report()`, this one **aggregates in SQL** —
    `LlmUsageRepository.spendByUsers(ids)` (two `groupBy` reads, no row transfer),
    scoped to the ids on the current page. The second read exists because "billed but
    unpriceable" (null cost + real tokens) can't be expressed as a sum: without it an
    unlisted model would render a confident `$0.00`. Web: an **AI cost** column in
    `AdminUsersTable` (`—` when every call is unpriced, a trailing `*` when only some
    are; i18n `admin.users.aiSpend*`, EN+AR).
  - **Known limit:** `report()` aggregates 30 days of rows **in JS** (the analytics
    precedent). `llm_usage` grows with paid work, not traffic, so this is the table
    most likely to need a SQL rollup first — it goes behind the repository
    interface when it does.
- **Provider selection** (`llm.module.ts`):
  `LLM_PROVIDER=mock|claude|groq|azure|siliconflow` forces it for all agents;
  else `GROQ_API_KEY` present → groq for everything; else
  `AZURE_OPENAI_API_KEY` present → azure; else `SILICONFLOW_API_KEY` present →
  siliconflow; else mock. **Groq keeps priority over Azure** so the documented
  "paste a free Groq key" behaviour is unchanged, and **SiliconFlow sits last**
  for the same reason — adding a key must never silently move an existing install
  off the provider it has been running on. Force with `LLM_PROVIDER=<kind>` when
  several keys exist.
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
- **SiliconFlow (`SiliconFlowLlmProvider`) — the REASONING-model seam.** Another
  OpenAI-shape provider mirroring `GroqLlmProvider` (native `fetch`, Bearer auth),
  aimed at the hosted DeepSeek catalog. Env: `SILICONFLOW_API_KEY` (required),
  `SILICONFLOW_MODEL` (default **`deepseek-ai/DeepSeek-R1`**), `SILICONFLOW_BASE_URL`
  (default `https://api.siliconflow.com/v1`; the `.cn` host is the mainland one).
  It is the first provider here whose default model *thinks before it answers*, and
  three things follow from that — none of them cosmetic:
  1. **No native JSON mode for DeepSeek.** SiliconFlow honours `response_format:
     json_object` across most of its catalog but the DeepSeek **R1 *and* V3** series
     reject it, so `supportsJsonMode()` gates it — and it is **not** `!isReasoningModel`,
     because V3 is not a reasoning model and still 400s. The whole `deepseek-ai/*`
     family is excluded rather than enumerated: too broad costs nothing (it falls back
     to the prompt nudge + `parseJsonFromLlm`, exactly what the Claude provider always
     did), too narrow breaks every call.
  2. **Thinking spends the output budget, so it gets its own allowance.**
     Everywhere else `maxTokens` means "room for the artifact" — `CHUNK_MAX_TOKENS`
     is sized to one chunk of endpoints, not to a chain of thought. Passing it
     through untouched would let the reasoning eat the ceiling and return a
     truncated answer: **the silent short-parse the API designer's chunking exists
     to prevent**. So a reasoning model gets `+REASONING_HEADROOM_TOKENS` on top and
     the caller's number keeps meaning what it means for every other provider.
     `thinking_budget` is deliberately **not** sent — the docs don't confirm R1
     accepts it, and an unsupported param is a 400 that takes out the whole provider.
  3. **`stripReasoning()` runs on every completion.** Reasoning normally arrives in
     a separate `reasoning_content` field, but a leaked `<think>` block is worse here
     than it looks: R1 **drafts and revises JSON while reasoning**, so
     `parseJsonFromLlm`'s balanced-brace scan would lock onto a discarded draft
     instead of the answer. An *unterminated* block means the response was cut off
     mid-thought ⇒ yields `''` ⇒ the agent's deterministic fallback, which beats
     parsing half a thought.
  Also: `completeJson`'s temperature 0 is **floored to 0.6** for reasoning models —
  DeepSeek documents that 0 sends R1 into endless repetition. Priced in
  `MODEL_PRICING` (`deepseek-ai/deepseek-r1`, $0.25/$0.80 per MTok); reasoning
  tokens bill as **output**, so an R1 call costs several times what its visible
  answer suggests.
- **Interview shape.** Kept **short: ≤ 9 questions** (`MAX_ADAPTIVE_QUESTIONS`).
  Questions may carry `options` + `multiple` on `InterviewQuestion` — the web
  renders tap-to-pick chips/checkboxes; the answer stays a **string** the client
  composes (picks + free-text detail), so the `answer` DTO/state machine are
  unchanged. The adaptive interviewer may also return `options`/`multiple` (mapped
  in `tryAdaptive`); plan questions ship curated options for scale/tech/features.
- **Slot-filling scoping interview (R6).** The interview is a **slot-filling
  session**, not a blind question generator: a fixed catalog of the facts a dev
  shop needs to scope a client bid (`SLOT_KEYS` in `@archivato/shared`;
  `SLOT_CATALOG` — descriptions + `askClientTemplate` — server-side in
  `interview/slots.ts`). Each adaptive turn (1) **extracts** slot values from the
  latest answer (`source: explicit|inferred`, `confidence`), (2) records a gap the
  owner couldn't answer as an **`openQuestion`** to forward to the client (instead
  of re-asking), (3) asks the single most important **missing** slot, in the
  project's own vocabulary. `budget_range` + `timeline` are new to scope and must
  be filled-or-open-questioned before `done`. Non-negotiables:
  - **The transcript (`history[]`) stays the source of truth.** `slots` /
    `openQuestions` on the session are a **derived cache**, always re-derivable
    from history — never authoritative over it. Both are nullable Json
    (**migration-free** convention; `20260715140000_add_interview_slots`).
  - **Merge is guardrailed** (`mergeSlots`, pure/tested): a later **explicit**
    value beats an earlier **inferred** one, *never* the reverse; a turn that fills
    one slot never drops the others. `reconcileOpenQuestions` drops a question only
    once its slot is answered **explicitly** (an inference is a guess that still
    needs client confirmation). LLM slot JSON is untrusted → `sanitizeSlots` /
    `sanitizeOpenQuestions` allowlist via `isSlotKey` (also closes the
    computed-key prototype-pollution path).
  - **All existing guardrails are untouched** — `MAX 9` cap, `MIN 3` floor,
    coverage clamp, positional plan fallback, phase validation. **Plan (offline/
    mock) mode fills no slots**, and downstream tolerates empty `slots`/
    `openQuestions` everywhere. Two known offline gaps, both accepted: the cap
    short-circuit skips extraction on the *final* answer, and the appended
    `budget`/`timeline` plan questions (`InterviewPhase.Commercial`) sit past the
    9-cap so a pure-plan run never reaches them.
  - **Notes-first mode** (`start` `notes?`, `NOTES_ENTRY_ID`): pasted call notes
    become `history[0]` (labelled to the prompt as call notes), then the **same**
    `advance()` loop runs — no parallel path. The first adaptive turn extracts many
    slots at once; in plan mode the notes are just answer #0 and the plan continues
    from position 1.
  - **Confirmation gate** exposes `slots` + `openQuestions` on `InterviewState`.
    The web `SlotReview` renders filled slots (inferred ones flagged
    "understood from your answers — correct?") + a **"Questions for your client"**
    copy-to-clipboard list. Editing a slot (`PATCH /interview/:id/slots`, owner-
    guarded, `editSlot`) **appends a correction to the transcript** and marks the
    slot `explicit`/`high` — the snapshot follows the transcript, never the reverse;
    refused once `confirmed`.
  - **Downstream:** `openQuestions` rides onto `RequirementDocument.openQuestions`
    (`requirements.service` → agent, attached on both LLM + deterministic paths).
    R6 plumbed it; **R7 (below) consumes it** — folding each gap into the
    requirement document's "Assumptions & open questions".
  - **`question.phase` IS NOT A DATA BUCKET on the adaptive path — `buildSummary`
    reads SLOTS.** This is the fix for a bug that corrupted an entire generated
    package. `RequirementsSummary` was derived by bucketing the transcript on
    `question.phase`: `goal = understanding[0]`, `users =
    understanding.slice(1)`, `features = answersForPhase(Features)`. That is
    correct **only in plan mode**, where `QUESTION_PLAN` hard-codes the phase per
    question (a1 *is* the goal, a2 *is* the roles). On the adaptive path the phase
    is a **free-text label the model attaches to a question it chose for
    slot-filling reasons** — so several unrelated answers land under one phase and
    others are never used at all. On a real run that made the data-entity,
    integrations and target-market answers render as **user roles**, left
    `features` **empty** (so the whole document collapsed to one requirement
    restating the industry), and fed the industry answer in as the goal. The
    summary now reads the slot snapshot (`summaryFromSlots`) — the structured
    extraction built for exactly this — and the positional fallbacks are applied
    **only when no slot was filled** (`hasFilledSlots` ⇒ a true plan-mode run).
    Three things not to undo: the phase buckets must stay for plan mode (they are
    exact there); `splitSlotList` must **not** split prose on its commas (a
    one-sentence workflow is one requirement, not three — the comma split is
    vetoed by a long fragment); and the **Commercial phase is deliberately no
    longer folded into `constraints`**, because that list flows into the
    Requirement Document, which may never state a budget or a date. Pinned by
    `adaptive-summary.spec.ts` (drives a scripted adaptive interview whose every
    question is labelled `understanding`) and `slot-summary.spec.ts`.
  - **`target_market` — the slot that makes compliance and PSP fees real.** Which
    country/region the software serves. It was the missing input behind two
    features that were already built but **dormant**: R9's regional payment-fee
    note (`buildServiceCostLines` was called with a hardcoded
    `targetMarket: undefined`) and any honest data-protection requirement. Its
    catalog entry says out loud why it's asked, because a client reads the
    forwarded question. Note the cost: this is an **11th slot in a ≤9-question
    interview**, so it will often go unfilled — which is fine, because an unfilled
    slot becomes an open question for the client, and every consumer treats
    "unknown" as a first-class answer rather than a cue to guess.
- **Region-aware compliance (`region.ts`) — never a blind GDPR/HIPAA.** An LLM
  writing a requirement document reaches for GDPR and HIPAA regardless of who the
  client is; they dominate its training data. For a MENA dev shop that is not a
  harmless extra — it names the wrong law in front of the one reader who knows
  better, and misses the one that applies (a Saudi project answers to the **PDPL**
  and its residency expectations). So the regime is **looked up in code, not
  recalled**: `resolveRegionKey()` classifies the `target_market` slot into
  `mena|us|eu|global` (Arabic spellings included — the slot holds the client's own
  words) and `REGIONAL_REGULATIONS` maps that to the laws, the residency line, and
  a prompt note. Pure, runtime-free, unit-tested. Four things not to undo:
  1. **`null`, never a default.** An absent or unrecognized market returns `null`
     (the `parseBudget` / `parseTimelineWeeks` rule) and the agents are then
     explicitly told to name **no** law and to raise the jurisdiction as an
     assumption for the client to confirm. A confident wrong law is the failure
     mode this whole file exists to prevent.
  2. **One classifier.** `resolveRegion` (pricing, in `cost-estimate.ts`) is now a
     thin wrapper over `resolveRegionKey`, so cost and compliance can never
     disagree about which market a project is in. `REGIONAL_SERVICES` is keyed by
     `RegionKey` rather than `string` so the compiler enforces that.
  3. **The US entry qualifies its own laws** (`HIPAA (only if protected health
     information is handled)`) because "which law applies" in the US is a *sector*
     question, not a national one — a table that flatly asserted HIPAA for every US
     project would reproduce the exact bug this replaces.
  4. **The deterministic fallback names the law too.** With a stated market the
     regime is a table lookup, not a judgement call, so the offline requirements
     path appends a real compliance NFR; with no market it appends nothing. The
     architect gets the residency line for the same reason — where data may legally
     live constrains the provider and the region, so it's an architecture input.
  **What this actually looked like before the fix**, on a generated clinic platform
  for *"providers across Jordan and Saudi Arabia"*: HIPAA and GDPR appeared in
  **six** places — a business rule, a constraint, an assumption, the out-of-scope
  list, the architect's justification for choosing PostgreSQL, and the review's
  single highest-severity risk. HIPAA is a US statute with no jurisdiction there,
  and the reviewer built its top finding on it. Nothing was broken; every stage was
  confidently, consistently wrong about the same thing.
- **QA tooling must be told the stack.** The QA planner's prompt asked for "tools
  matched to the stack" and **never sent the tech stack** — so a Node.js/React
  project came back recommending **JUnit** (Java) and Selenium. It didn't fail
  loudly; with no stack in context the model recommends the ecosystem it has seen
  most. When a prompt asks the model to match something, check that the something
  is actually in the prompt.
- **Requirement Document = a two-audience scoping artifact (R7).** The Requirement
  Engineer now emits a **client-facing** document, not a bare requirements dump —
  additive fields on `RequirementDocument` (`@archivato/shared`), all optional so
  old rows/plan-mode runs render fine and every consumer tolerates absence: a
  jargon-free **`executiveSummary`** (who it serves / what they can do / the
  business outcome), **`outOfScope[]`** (`{item, reason?}` — a first-class
  scope-creep guard, 3–6 capabilities NOT included), and
  **`assumptionsAndOpenQuestions[]`** (`{assumption, impactIfWrong}` — the agent's
  gap-filling assumptions **merged with** the interview's `openQuestions`, each
  phrased as an assumed default). Section order (owner page + exporters + share
  client block): exec summary → functional → roles → out-of-scope → assumptions →
  then the technical sections (NFR/business rules/constraints). Non-negotiables:
  - **Two audiences, one document.** The prompt bans jargon ("CRUD"/"endpoint"/
    "schema"/"API") from the client sections and phrases functional reqs in the
    **user-outcome voice** ("Customers can track their orders"), not "the system
    shall". NFR/rules/constraints may be technical.
  - **`budget_range` + `timeline` are context only — never printed.** The agent
    gets the full slot snapshot but strips those two before the prompt; a test
    asserts their values never appear in the document (they belong to roadmap/cost).
  - **Out-of-scope has a deterministic source.** `DOMAIN_COMMON_SCOPE` /
    `GENERIC_COMMON_SCOPE` (`interview/slots.ts`, code not model — the
    `DOMAIN_FOLLOW_UPS` precedent) name the capabilities a buyer typically expects
    but forgets to ask for; `domainCommonScope()` is the fallback's source and a
    prompt hint on the LLM path, so the section is never empty (e.g. a delivery app
    → "Live GPS tracking" listed as excluded).
  - **Traceability is preserved.** FR/NFR/BR **ids stay stable and untouched** —
    R7 changed structure and phrasing, not the ID scheme; the system-design stage
    still reads requirement IDs. `normalize()` backfills any R7 section the model
    skipped and always folds the open questions in; `save()` (the structured
    editor) **carries the narrative sections over** (they aren't in the editor DTO,
    so an edit must not wipe them), and `RefinementAgent` spreads `ctx.current`
    first so a chat refine can't drop them either.
  - **Share page (R3) split:** the client "What's included" block renders
    `<RequirementDocumentView audience="client">` (exec summary + functional +
    roles + out-of-scope + assumptions); NFR/business rules/constraints move to a
    `audience="technical"` **Collapsible in the technical appendix**. i18n
    `requirements.{executiveSummary,outOfScope,assumptionsAndOpenQuestions,
    impactIfWrong}` + `share.appendix.requirements` (EN+AR). Owner page shows all
    sections (`audience="full"`) with IDs demoted to muted mono reference text.
- **System Design = constraint-aware, priceable architecture (R8).** The System
  Architect now reads the interview's **constraint slots** (`SystemDesignContext.slots`
  — `budget_range`/`timeline`/`scale_expectations`/`constraints`/`existing_assets`,
  threaded through `SystemDesignService.generate` from `session.slots`, possibly
  absent) and emits four additive, optional fields on `SystemDesign`
  (`@archivato/shared`, all back-compat so old rows/plan-mode render fine):
  1. **`buildVsBuy[]`** (`{capability, recommendation:'build'|'buy', suggestedService?,
     rationale, impact}`) — a build-vs-buy call over a **closed** capability set
     (`BUILD_VS_BUY_CAPABILITIES` = auth/payments/notifications/file_storage/maps_geo/
     search; `isBuildVsBuyCapability` guards it). The fallback source is a static
     `BUILD_VS_BUY_TABLE` (code, not LLM) keyed by an `applies` regex over the
     requirement haystack — **auth is always included** (role names like "Customer"
     don't surface as auth keywords). "Buy" picks are generic well-knowns (Stripe,
     Twilio/Resend, S3/R2, Google Maps/Mapbox); payments is always "buy", search/auth
     "build".
  2. **Module `complexity` (`S|M|L|XL`) + `complexityRationale`** on each
     `ServiceModule` — deterministic heuristic = related-requirement count + fan-out
     (dependencies) + a `domainWeight` bump for intrinsically heavy domains
     (payments/search/geo). **Every module always carries one** (the LLM path is
     backfilled by `ensureComplexity`, the fallback derives it).
  3. **`phasedArchitecture` (`{mvp, growthPath, migrationNotes}`) — CONDITIONAL.**
     Present **iff `hasScaleConflict`**: stated **large scale** (`LARGE_SCALE` regex
     over the `scale_expectations` slot or haystack) **AND** a **tight budget or
     timeline** (`TIGHT_BUDGET`/`TIGHT_TIMELINE` over those slots). Its presence is a
     pure function of the (deterministic) conflict test on BOTH paths — `normalize()`
     **gates a model-supplied phased block off** when there's no conflict, and
     backfills one when there is. Empty slots (plan mode) ⇒ no conflict ⇒ omitted.
  4. **`constraintCompliance[]` (`{constraint, howAddressed}`)** — passthrough of the
     `constraints` slot + `requirements.constraints` (deduped), each mapped to a
     `howAddressed` line. Empty array when no constraints.
  - **The deterministic `inferServices` derives DOMAIN services from the entities.**
    It used to be a pure keyword template that could only ever emit `Auth · Users ·
    Billing · Notifications · Reporting` — so a fashion store and a clinic system
    got **byte-identical** service lists and the actual product (catalog, orders,
    inventory) appeared nowhere in its own architecture. `domainServices()` now
    reads the `data_entities` slot (falling back to the functional-requirement
    titles), and inserts those modules straight after the account services. Four
    guards, each from output that shipped wrong: a name shorter than
    `MIN_ENTITY_NAME_CHARS` is **dropped**, so a placeholder `x` answer can't
    become a service module named `Xs`; `GENERIC_SERVICE_NOUNS` stops a `User`
    entity duplicating the `Users` service; `belongsTo` folds a dependent record
    into its parent (`Order Item` → Orders, `Product Variant` → Products) by
    **prefix** match, so the stage emits a service per *capability* rather than one
    per table — candidates are sorted shortest-name-first precisely so the parent
    is accepted before its child; and the count is capped at
    `MAX_DOMAIN_SERVICES`. Note this is the **fallback**, which is what an install
    with no LLM key ships for every project — see the mock-provider gotcha.
  - **Constraint-grounded rationale + simplicity bias.** The prompt makes every major
    decision cite the relevant constraint and NAME the rejected alternative and why it
    loses; under a tight budget/timeline the architect prefers the **simplest**
    architecture (`inferArchitecture` pins to `modular_monolith` when tight, even past
    scale words — the phased plan captures the growth path). Budget/timeline are
    **context only — referenced qualitatively ("the tight timeline"), never the exact
    figure/date** (the R7 precedent; scale MAY be named).
  - **Haystack excludes budget/timeline/scale slots** (a budget like "we can pay $5k"
    would trip the payments/maps keyword detectors) but folds in
    business_domain/core_workflows/data_entities/integrations/existing_assets.
  - **Traceability + downstream compat preserved.** Requirement IDs, the module
    structure, the Mermaid builders, and the **"Explain this decision"** mechanism all
    read unchanged fields; API-design + cost-estimate read only `services`/`techStack`/
    `architecture`, untouched. Persistence is the JSON-blob convention (migration-free).
    `SystemDesignService.save` carries the R8 analysis over from the stored design (the
    structured editor's `Draft` doesn't include it) and **restores each module's
    complexity by name** so an edit can't wipe it.
  - **Web.** `SystemDesignView` renders complexity badges on the service cards, a
    build-vs-buy table, the phased block (when present), and a constraint-compliance
    table at the end; a **`buildVsBuyFirst`** prop leads the share appendix with
    build-vs-buy (the most client-readable part) while the owner page keeps it after
    the services. i18n `stages.system.{buildVsBuy,phased,compliance}.*` (EN+AR). The
    markdown exporters (web `systemDesignToMarkdown` + api `markdown.builder`) and the
    example fixture (`EXAMPLE_SYSTEM_DESIGN`) carry all four sections.
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
  (**`/support/:id`** for the customer, **`/support/admin/:id`** for staff).
  - **These links must match the web app's real routes, and a string test cannot
    check that.** They used to carry an extra segment (`/support/tickets/:id`),
    which matched **no route at all** — Next resolves `support/[id]` against a
    *single* segment — so every in-app notification and every notification
    **email** landed on a 404. That is the worst place for this bug: the deep link
    is the entire reason the email exists, and a customer who clicks "you have a
    reply" and gets a 404 concludes the product is broken. It survived because the
    unit test asserted the link *contained* `/support/tickets/`, and a substring
    check on a path can't tell a live route from a dead one.
    **`support-notification-links.spec.ts`** now resolves each emitted path
    against the web app's actual route files on disk (the App Router's filesystem
    **is** the route table, so it can't drift from itself) and asserts the old
    paths still resolve to nothing — so the test can genuinely fail. Move the
    ticket page ⇒ move these links.
  The **`notifications` module** is a normal repo-pattern store
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
- **Design system (R14) — tokens only, one accent, colour must MEAN something.**
  Tailwind + shadcn/ui under `components/ui/`. Every token is an HSL CSS var in
  **`globals.css`** (light on `:root`, dark on `.dark`); `tailwind.config.ts` only
  *exposes* them and may never hold a literal. Theme via `ThemeProvider`;
  providers: Theme → Toast → Confirm → **Upgrade** → AuthGate. Reference page:
  **`/design`** (dev-only, 404s in prod) renders every token + variant.
  1. **Raw hex and Tailwind's stock palette are BANNED in components**, enforced
     by `no-restricted-syntax` in `.eslintrc.json` (it catches `bg-blue-500` *and*
     arbitrary values like `text-[#fb923c]` — that second form is how three
     violations hid from a palette-name grep). The `overrides` list is the set of
     files that legitimately hold literals, each for a reason CSS can't solve:
     **`lib/node-category.ts`** (React Flow's MiniMap sets its swatch via an SVG
     `fill` **attribute**, where `var()` does not resolve), **`lib/og.tsx`** +
     the icon/image routes (Satori has no CSS engine), **`lib/site.ts`** (brand
     constants read by crawlers), **`app/layout.tsx`** (`<meta theme-color>` is
     read by OS chrome before any CSS loads), `LanguageMenu`/`AuthForm` (flag +
     third-party brand SVGs), `ExportView` (a print window with no stylesheet).
     Anything else needs an `eslint-disable-next-line` **with the reason**.
  2. **Colour means exactly one of two things.** A **semantic state**
     (success/warning/destructive/info) or an **unordered data category**
     (`--data-1..5`, the canvas node kinds — the one place non-semantic hue earns
     its keep). Decorative hue is not a category: R14 deleted a six-tone rainbow
     from the artifact `Section` headers and a twelve-entry NFR colour map,
     because the requirement document is what the owner's **client** reads and a
     rainbow reads as a template. Don't reintroduce one.
  3. **Every semantic ships FOUR tokens** and the pairing is the contract:
     `--x` (solid fill) + `--x-foreground` (text on it), `--x-subtle` (tinted
     surface) + `--x-subtle-foreground` (text on THAT). Use the pair; never mix a
     solid with a subtle-foreground. The old `bg-success/15 text-success` idiom
     composited a tint onto an unknown surface and then put the *solid* colour on
     it — which failed AA in dark mode, where the solid token is lightened for
     dark backgrounds. Explicit colours make each chip's contrast a fixed number.
  4. **Ordered ramps reuse the semantic ladder; they don't get new hues.** Module
     complexity S/M/L/XL → success/info/warning/destructive (rising size = rising
     cost). Severity is the one exception: it genuinely has **four** rungs, so
     `--severity-high` exists between warning and destructive — collapsing `high`
     into `destructive` would make a high finding indistinguishable from a
     critical one, which is the distinction that decides what an owner fixes.
  5. **Brand constants are named by ROLE, not hue** (`brand.accent`,
     `accentDeep`, `accentBright`, `ink` in `lib/site.ts`). They were `indigo` /
     `cyan`, and when the accent moved to teal every name became a lie that still
     compiled. They mirror `--primary`/`--background` and are literals only
     because Satori/favicons/`theme_color` render where no stylesheet exists —
     **retune them together**, including the on-dark mark colours in `lib/og.tsx`
     (an inline `#A5B4FC` there survived the repaint and shipped a purple-noded
     logo on a teal card; verify by fetching `/opengraph-image` and *looking*).
- **Typography — static weights, and never `-webkit-font-smoothing` (R14).**
  Inter (Latin) + IBM Plex Sans Arabic (Arabic) + JetBrains Mono, self-hosted via
  `next/font` in the **root** layout (the landing and share pages live outside
  `(app)`, so loading them there would strand exactly the two surfaces a stranger
  sees first on the fallback stack). Two rules, both learned the hard way, both
  about **Windows** — which is most of this audience:
  1. **Do not add `-webkit-font-smoothing: antialiased`.** It reads like polish
     and is the opposite: on Windows it disables DirectWrite/ClearType subpixel
     AA and forces grayscale, so text renders thin and blurry. It only ever
     existed to tame macOS's heavy subpixel rendering, and **macOS removed
     subpixel AA in Mojave** — so on every current OS it has no upside.
     `text-rendering: optimizeLegibility` is out for the same reason.
  2. **The weights are enumerated on purpose — do not drop `weight` to get the
     variable font.** Chromium on Windows rasterises **variable** fonts with
     grayscale AA instead of ClearType, so bold weights render smeared. Static
     instances take the normal ClearType path. Cost: ~4 woff2 instead of 1.
     `font-synthesis-weight: none` guards the corollary — Tailwind's
     `font-extrabold`(800)/`font-black`(900) have no file and would faux-bold
     (blurry by construction), so they fall back to a real weight instead.
  Arabic gets `--leading-script: 1.85` (vs 1.6) and zero tracking, keyed off
  **`[lang]`, not `[dir]`** — script and layout direction are different questions.
- **Responsive + RTL — wide content adapts itself; direction is logical (R14).**
  **Exit criteria, and it is measured, not eyeballed:** the page body must never
  scroll sideways, at any width, in either direction, in either theme. Verified
  by driving a real browser over 48 combinations (4 public pages × 360/768/1280 ×
  {dark,light} × {LTR,RTL}) and asserting `documentElement.scrollWidth <=
  clientWidth`. That check found two live overflows a screenshot pass had missed.
  1. **`components/ui/table.tsx` does two different things at two widths, and
     both halves are load-bearing.**
     - **From `sm` up: it scrolls.** `overflow-x-auto` on the wrapper + a
       **`sm:min-w-[34rem]`** floor on the `<table>`. The min-width is the half
       people forget: the wrapper always had `overflow-auto`, but a `w-full`
       table with no floor doesn't scroll — it **compresses**, squeezing three
       columns to ~40px each and wrapping one word per line. Opt out with
       `min-w-0`.
     - **Below `sm`: it STACKS** into labelled rows (`[data-stack]` in
       globals.css). Horizontal-scrolling a 3-column requirements table on a
       360px phone is technically legible and practically horrible — you swipe to
       read a priority and swipe back to see whose it was. Opt out with
       `stack={false}`.
     Three traps inside the stacking, each of which bit:
     - **The cell is a GRID, not a flex row.** A cell's value is often several
       elements (a requirement's title *and* its description); `display:flex`
       makes them siblings in one row and they render on top of each other. It's
       `grid-template-columns: <label> minmax(0,1fr)` with `td > * {grid-column:2}`
       — without that forcing rule the second child auto-places back under the
       *label*. `justify-items:start` keeps a Badge at its natural width instead
       of stretching it into something that reads as a progress bar.
     - **`display:block` DESTROYS a table's implicit ARIA semantics**, which is
       why table.tsx sets explicit `role="table|rowgroup|row|columnheader|cell"`.
       They look redundant at desktop width and are the only reason a screen
       reader still hears rows and columns at phone width. `thead` is *clipped*
       (sr-only), never `display:none`, so column headers stay in the a11y tree —
       `::before` content is generated and is not reliably announced.
     - **`data-label` is HARVESTED, not hand-written.** `TableRow` reads the
       header row's text into a ref and stamps each body cell by index. The
       alternative was `data-label={t('…')}` on ~100 cells — the same string
       typed twice, guaranteed to drift. It also means the label is *translated*
       for free (the Arabic run harvests `المعرّف`). Ordering is what makes it
       safe: React renders `TableHeader` before `TableBody`.
  2. **Its ancestor must be able to shrink.** A flex child needs **`min-w-0`** or
     it adopts the table's min-width and pushes the whole page into a horizontal
     scroll — which is why the stage-content wrapper in `ProjectStages` has it.
     This is the trap that makes (1) look broken.
  3. **A row holding a `whitespace-nowrap` button must be able to wrap.** Every
     artifact header (`flex items-center justify-between` + a meta line + a
     Download button) overflowed the page at 360px, because the button can't
     shrink and the row couldn't wrap. They all carry `flex-wrap` now, and the
     text block beside them carries `min-w-0`.
  4. **AI-generated artifact text needs `dir="auto"`, and RTL is where you find
     out you forgot.** The artifacts are server-side English; on an Arabic page
     an English string with no `dir` inherits RTL and bidi reorders it — the
     sentence's full stop jumps to the wrong end. The requirements/NFR/business-
     rule cells were missing it and looked fine in every LTR screenshot.
  5. **Logical properties, always** (`ms/me/ps/pe`, `start/end`, `text-start`).
     R14 swept up live bugs where physical ones had shipped: toasts pinned
     `right-4` (so they surfaced on the RTL page's *leading* edge), `TableHead`
     used `text-left` (headers hugging the wrong edge while their cells aligned
     right), the Select check indicator sat at `left-2` over the Arabic label,
     `Alert`'s icon at `left-4`/`pl-7` let RTL text run underneath it, a
     `list-disc pl-5` hung its bullets off the wrong edge, and the service/role
     cards' `border-l` accent bar stayed on the physical left.
     `left-1/2 -translate-x-1/2` centring is symmetric and fine.
  6. A chevron that **rotates** to show state needs no `rtl:-scale-x-100` — it's
     symmetric about the vertical axis. An **arrow** does.
- **Loading = skeletons shaped like the content, never a spinner (R14).** A
  spinner says "wait"; a skeleton says "here is what is coming, and how much".
  `ArtifactSkeleton` (`components/shared/`) is the one loading state for every
  standalone artifact panel — vision/roadmap/cost/threat/QA each rendered their
  own copy-pasted `<Skeleton h-16/><Skeleton h-40/>`, which was five copies of
  one decision **and** looked nothing like what arrived, so the page visibly
  re-laid-out on load. It mirrors the real shape (meta row → prose section →
  table rows); `ProjectCardSkeleton` does the same for the dashboard grid, and
  the share page has its own document-shaped one (it is the first thing a cold
  visitor sees). `Skeleton` shimmers rather than pulses — a pulsing block reads
  as *disabled* — and carries `motion-reduce:animate-none`, since the shape
  carries the meaning and the animation is only the liveness cue.
- **`/demo-scoping-package` — the public proof (R14).** A complete client
  scoping package, indexable, rendered by the **same `SharedProjectView`** a real
  share link uses, from the **same fixture** the in-app example tour uses
  (`lib/demo-scoping-package.ts`). The landing page can only *describe* the
  output; a prospect's real question is "is what this sends my client good enough
  to put my name on?", and only the artifact answers it — previously you had to
  sign up, interview and generate to see one. Four things not to undo:
  1. **It reuses the real share page.** No separate "marketing version" of the
     artifact exists to drift out of sync, and a share-page regression shows up
     here loudly.
  2. **It applies the SAME owner-only redaction the server does** —
     `redactReviewForShare()` + `budgetWarning: null`, mirroring
     `ShareService.view`. Not for security (it's a fixture, nothing is secret)
     but for **honesty**: showing the client-readiness findings and the budget
     warning would show a prospect something no real client ever receives.
  3. **It is INDEXABLE, and `/s/<token>` never will be.** The difference is
     consent, not content: this is a fictional package we wrote to be published;
     a share link is someone's real business idea sent to specific people. It's
     in `publicRoutes` (→ sitemap) and earns the "client scoping" keyword
     (POSITIONING §4.7) with something better than copy.
  4. **`watermark: false`** — the watermark is what a *free owner's* link
     carries; printing it on our own marketing page would advertise to ourselves
     and show a prospect the downgraded output. `sharedAt` is a fixed date, not
     `new Date()`: the page is statically prerendered, so a live clock would bake
     in the build date and then quietly age.
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
  and an optional **`clientName`** (the client a scoping is for — both session
  columns; `PATCH /interview/:id`, owner-guarded — the idea stays the AI's untouched
  source; cards show `title || idea`). A per-card **kebab menu**
  (`ProjectMenu`, rendered as a *sibling* of the open-button, never nested):
  **Rename** + **Set/Change client** (both inline inputs sharing one editor),
  **Direct Export** (JSON/Markdown/OpenAPI for confirmed
  projects — reuses the Pro `exportApi`; a 402 opens the upgrade modal, 409 hints to
  finish the pipeline), **Delete**. **Smart Resume**: the last stage tab viewed per
  project is saved (`archivato.lastTab:<uid>:<sid>` in `goToStage`) and restored in
  `openProject` (ProjectStages re-guards availability); a **Continue banner** resumes
  the most-recent project on that tab.
- **The dashboard is a DEAL BOARD, not an experiment list** (client-scoping pivot).
  Cards lead with the **client name** (`ClientLine`), a compact **pipeline rail**
  (`PipelineRail`, one segment per stage), a **"Sent to client"** badge when a share
  link exists, and a primary **"Copy client link"** action (`CopyLinkButton`). The
  empty state teaches the workflow (`dashboard.projects.emptyHelp`: bring the call's
  answers → run the interview → send the proposal) instead of describing the
  pipeline. Two things not to undo:
  1. **The list comes from a NEW read-model, `GET /projects` (`ProjectsModule`),
     not `GET /interview`.** The card needs two facts the session doesn't hold — how
     far the pipeline got, and whether a link was sent — so `ProjectsService`
     projects `ProjectOverview` = `ProjectSummary` + `artifacts` (existence booleans
     per stage) + `shared` (a share row exists). It imports *downward* (interview +
     the five design stores + `ShareModule` for the share-link token); the reverse is
     a cycle, since every design module already imports `InterviewModule`. A read-only
     composing module — the AdminService read-model precedent, but through the repo
     interfaces so it unit-tests against the in-memory impls. **Adding a route + a
     Prisma column means the running `dev:api` must be restarted and the migration
     applied — a stale server 404s `/projects` and the dashboard silently shows
     nothing.**
  2. **Progress + link state are PURE, derived from artifact existence**
     (`@archivato/shared/projects.ts`): `projectProgress(status, artifacts)` (the
     artifacts *are* the truth — a version restore can rewind them, so never a stored
     counter; `interview` is the one step with no artifact, unlocked by `confirmed`)
     and `clientLinkState(project)` → `locked | ready | sent`. `locked` is the one
     that matters: the API mints only once the **database design** exists
     (`canShareProject`), so the button is *disabled with the reason*, not offered as
     a 409. `CopyLinkButton` calls `shareApi.create` (idempotent — an existing link
     comes back unchanged, so "first send" and "already sent" are the same call and a
     link already emailed is never silently rotated).
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
- **The artifact nav is ordered by the DEAL, not the build (R12).** `TABS` runs
  vision → requirements → **cost → roadmap** → system → database → api → apidocs →
  diagrams → canvas → review → threat → qa → export. It used to mirror the
  *pipeline* (requirements → system → database → api), which is the order the
  **machine** works in, not the order the owner sells in — what a dev shop reaches
  for after a client call is the scope, the price, and the timeline. Purely
  presentational: routes and deep links are unchanged, and cost/roadmap still need
  the full pipeline, so they sit early **disabled** until the API design exists.
  That's the honest read ("this is coming, and it's what matters") where burying
  them behind eight technical tabs said the opposite.
- **The export surface is organised by AUDIENCE, not by file format (R12).**
  `ExportView` = two primary cards — **Send to client** (`shareApi.create`,
  idempotent, copies the link) and **Hand off to your team** (the existing
  `all.zip`) — plus a **"More formats"** dropdown holding every individual export,
  unchanged. **Nothing was removed**; the flat row of nine equal buttons just asked
  the owner to know what a Postman collection was before they could send a client
  anything. Pinned by `ExportView.test.tsx` (every format still reachable).
  **Client-facing PDF is deliberately NOT built** — see the TODO note below.
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
- **`LLM_PROVIDER` must stay UNSET — and check the REPO-ROOT `.env`, not just
  `apps/api/.env`.** This one silently forced the whole pipeline onto `mock` for
  days. **`@prisma/client` loads the repo-root `.env` into `process.env` when it
  is imported**, and `app.module.ts` requires PrismaModule *before*
  `ConfigModule.forRoot()` evaluates — and ConfigModule merges
  `{...envFile, ...process.env}` with **`process.env` winning**. So a stray
  `LLM_PROVIDER=mock` in the root file **outranks** a perfectly good
  `GROQ_API_KEY` in `apps/api/.env`, and the same is true of *any* key duplicated
  across the two files (JWT secret, SMTP, cookie flags). Symptoms: templated
  artifacts **and an AI-spend report that shows $0** (the meter is right — mock
  calls cost nothing). `llm.module.ts` now **warns loudly at boot**
  (`mockOverriddenKeys`) when it resolves `mock` while a real key is set; confirm
  via the startup `LLM provider:` log either way.
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
- **Downloaded text files carry a UTF-8 BOM — but only the ones a human opens.**
  The bytes were never wrong: a `Blob` built from a JS string is UTF-8 and the API
  sends `charset=utf-8`. Windows doesn't care — Notepad, Word and Excel guess the
  ANSI codepage for a BOM-less file, so a real exported requirement document read
  `**Modular Monolith** â€" Given the tight budget…` and a cost table read
  `1Ã— compute instance`. That lands on the artifact an owner forwards to a client,
  where mojibake reads as broken software. `saveFile` prepends `﻿` for
  `BOM_TYPES` (markdown / csv / plain) and **nothing else** — a BOM makes
  `JSON.parse` throw and `psql` will try to execute one.
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
- Do not add any extra comments, only edit the important comments.