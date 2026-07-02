# Archivato AI Builder — Project Memory

## What We're Building

An AI SaaS that turns a business idea into a complete software system design.
NOT a chatbot — it's an **AI Software Architecture Generator**.

Pipeline: `Idea → Interview → Requirements → System Design → DB Design →
API Design → Review → Export`. Review is a multi-dimension **AI Architect
Review** (overall + per-dimension scores for security/scalability/performance/
cost, findings per category, critical-issues callout). Two standalone artifacts
hang off the confirmed session: **Product Vision** (PM view of the interview)
and **Roadmap** (phased implementation plan from the full design). Plus
post-generation **chat refine**, **version history**, **diagrams/canvas**, **auth**.

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
npm run test:api
npm run test --workspace @archivato/api -- <file>   # single test

# Lint
npm run lint --workspace @archivato/api    # eslint src/**/*.ts
npm run lint --workspace @archivato/web    # next lint

# Prisma (from apps/api)
npm run prisma:migrate --workspace @archivato/api    # migrate dev
npm run prisma:deploy  --workspace @archivato/api    # apply in prod
```

**Run prereq:** `docker compose up -d db redis`, then `prisma:migrate`, before
`dev:api`. Redis is required for `/jobs` (async generation + snapshots).

## Architecture

- **Modular monolith.** Each pipeline stage is its own Nest module
  (`interview`, `requirements`, `system-design`, `database-design`,
  `api-design`, `review`, `product-vision`, `roadmap`, `export`, `chat`,
  `jobs`, `versions`, `diagrams`, `auth`, `billing`). Modules export their
  repository token + service for downstream use.
- **Standalone stages** generate from the session but don't gate, and aren't
  gated by, the design chain; each has its own artifact table + owner-guarded
  controller and is not in version snapshots. `product-vision` needs only the
  confirmed interview; `roadmap` needs the full pipeline (imports all upstream
  stores like `review`, 409s until the API design exists).
- **Agents backfill via `normalize()`.** Where an artifact has many optional
  parts (e.g. the reviewer's per-dimension scores/findings), the agent trusts a
  valid LLM response but fills any omitted field deterministically, so the shape
  is always complete. New optional fields on a JSON-stored artifact need
  defensive defaults in consumers (view + markdown export) for old rows.
- **Repository pattern everywhere.** Every store has an interface + in-memory
  impl (used by unit tests, DB-free) + Prisma impl. Feature modules provide the
  Prisma repo.
- **Billing / project quota.** Capacity is a **max-projects-owned** count (dollars
  are plan prices): **Free = 1 project**, **Pro = $19/mo → 5 projects**. Enforced
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
  and everything after it — AI review, roadmap, and export.** Enforced by
  `BillingService.assertPro(userId)` (throws **402** `code:'upgrade_required'`)
  and a reusable **`ProGuard`** (exported by `BillingModule`) applied to the
  Pro-only generate routes (`api-design`/`review`/`roadmap` generate, all of
  `export`). The async path is gated in `JobsController` (per-stage: `PRO_STAGES
  = {api-design, review}`). The web wall lives on the **API tab** (`ProjectStages`
  shows an `UpgradeStage` prompt when `!isPro`); downstream tabs stay disabled
  because a free user never has an `apiDesign`.
- **LLM behind `LlmProvider`.** Agents (`llm/agents/*`) depend only on the
  interface and use `completeJson<T>()` (strips fences, throws
  `LlmJsonParseError`). **Every agent has a deterministic fallback**, so bad/no
  model output still yields a valid artifact (mock mode + tests stay offline).
- **Provider selection** (`llm.module.ts`): `LLM_PROVIDER=mock|claude|groq`
  forces it for all agents; else `GROQ_API_KEY` present → groq for everything;
  else mock. `INTERVIEW_LLM_PROVIDER` overrides only the interview. Model via
  `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`; `claude-opus-4-8` available).
- **Gating:** each stage refuses to generate until its upstream artifacts exist
  (interview must be `confirmed`); returns 409/404 accordingly.
- **Ownership:** pipeline routes are `@UseGuards(JwtAuthGuard, SessionOwnerGuard)`.
  `SessionOwnerGuard` (exported by InterviewModule) 404s on missing/not-owned
  sessions (no existence leak). Sessions carry a nullable `userId`.
- **Auth:** JWT access + opaque refresh, both **httpOnly cookies**
  (`archivato_access` 15m, `archivato_refresh` 7d). Only token *hashes* stored;
  refresh rotated single-use. Email verify + forgot-password (OTP) + OAuth
  (Google/GitHub, manual code flow). Web client auto-refreshes on 401.
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

## Frontend Notes

- **Structure:** `app/` holds routes only — `layout.tsx`, `page.tsx` (public
  marketing **landing** at `/`), and route dirs `dashboard/`, `login/`,
  `register/`, `verify/`, `settings/`. Feature components live in
  `components/<domain>/` (`auth`, `interview`, `design`, `review`, `product`,
  `roadmap`, `project`, `settings`, `shared`, `marketing`) alongside
  `components/ui/`. Import via the `@/*` alias
  (→ web root), e.g. `@/components/project/ProjectStages`, `@/lib/api`.
- **Auth gating:** `AuthGate` (in the layout) wraps everything. `/` and
  `/verify` are public (`PUBLIC_EXACT` / `PUBLIC_PREFIXES`); `/login`+`/register`
  are guest-only (signed-in users bounce to `/dashboard`); every other route
  shows the `AuthForm` when signed out. The app itself lives at `/dashboard`.
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
  logos must be inlined, not `<img>`-referenced.
- **Landing** (`components/marketing/`): a self-contained public marketing page
  (`LandingPage`) with a looping, auto-playing `IdeaToProductDemo` reel
  (client-only, respects `prefers-reduced-motion`), a horizontal pipeline flow
  rail, and an artistic staggered "how it works". Purely presentational — safe to
  restyle without touching the app.
- Confirmed project view = `ProjectStages` (tabbed, one stage per tab, downstream
  tabs disabled until prereqs exist). `app/dashboard/page.tsx` is the slim
  orchestrator.
- Structured **editors** (PUT per artifact) + **canvas** (React Flow) both save
  via the same update endpoints. Unsaved-edit leave guard lives in the dashboard
  page (`dirty` + `confirmLeave()` + in-app `useConfirm`).

## Gotchas (read before you trip on them)

- **`.env` `LLM_PROVIDER` must stay UNSET** to let `GROQ_API_KEY` flip the
  pipeline (an explicit `mock` forces mock). `apps/api/.env` is gitignored — the
  user pastes real keys there; confirm via the startup `LLM provider:` log.
- **Windows:** stop `dev:api` before `prisma migrate/generate` (engine-DLL lock
  → EPERM).
- **Don't `next build` while `next dev` is running** (overwrites `.next` → dev
  500s). If it happens: `rm -rf apps/web/.next` and restart dev.
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

## Rules

- Build incrementally, one module/slice at a time; **ship backend + matching
  frontend** each slice so the user can click through and verify.
- Never skip DTOs, Guards, validation. Always use the Repository pattern.
- Environment variables for all secrets.
- **Ask before making architectural decisions.**
- After each slice, run `/security-review` + `/code-review` and fix findings.
- Keep `README.md` + this file updated per slice.
