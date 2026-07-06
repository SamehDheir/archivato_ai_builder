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
Compose maps **Postgres to host port 5433** (not 5432, to avoid clashing with a
local Postgres) and Redis to 6379; `DATABASE_URL` in `apps/api/.env` must match.

**API surface:** the NestJS app runs on **:3001** under a global **`/api`** prefix
(`main.ts` `setGlobalPrefix('api')`) — every route is `http://localhost:3001/api/...`.
`main.ts` also sets `rawBody: true` (Paddle webhook HMAC) + a global
`ValidationPipe`; CORS is locked to `WEB_ORIGIN` with credentials.

## Architecture

- **Modular monolith.** Each pipeline stage is its own Nest module
  (`interview`, `requirements`, `system-design`, `database-design`,
  `api-design`, `review`, `product-vision`, `roadmap`, `cost-estimate`,
  `export`, `chat`, `jobs`, `versions`, `diagrams`, `auth`, `billing`,
  `analytics`, `admin`, `support`, `roles`, `waitlist`).
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
- **Provider selection** (`llm.module.ts`): `LLM_PROVIDER=mock|claude|groq`
  forces it for all agents; else `GROQ_API_KEY` present → groq for everything;
  else mock. `INTERVIEW_LLM_PROVIDER` overrides only the interview. Model via
  `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`; `claude-opus-4-8` available).
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
  agents too). The web dashboard (`/dashboard`) renders a **`StaffHome`** for staff
  instead of the project creator — a card per console their permissions grant
  (Support → `/support/admin`, Analytics → `/admin`, Roles → `/admin/roles`,
  Billing), so the view is the **union** of their roles (a support agent sees only
  Support; a super admin sees all). i18n'd (`dashboard.staff.*`, EN+AR).
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
  the AI never leaks another user's data. The Knowledge Base is a **seed set in
  `support-knowledge-base.ts`** (placeholder UI, no CRUD) that `searchKnowledgeBase()`
  queries for deflection. In-ticket/copilot runs persist a `SupportAiSuggestion`
  + an `ai_suggestion` event; deflection logs a best-effort `SupportAiInteraction`.
- **Attachments = metadata + inline text.** No object store: the client extracts
  text from text-based files (log/txt/json) and sends it as `textContent` (stored
  inline for AI log analysis); binary files (image/pdf/zip) are metadata-only (no
  bytes served). Mime allowlist + 5 MB cap enforced by DTO. The mapper exposes
  only an `isText` flag to the client, never `textContent`.
- **Support notifications = placeholder.** `SupportNotificationsService`
  centralizes every in-app/email/AI-smart-alert point and just logs today
  (best-effort — never breaks a ticket action); wire a real channel later without
  touching callers. **Web:** `/support/*` routes (`SupportNav` sub-nav:
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

- **i18n (English + Arabic, toggle-based, RTL).** `react-i18next` with statically
  **bundled** JSON resources (`locales/{en,ar}/<namespace>.json`, registered in
  `lib/i18n/resources.ts` — namespaces: common, auth, marketing, dashboard,
  billing, interview, project, stages, settings, admin, support). No locale routing: the
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
  `/support/*` (customer + admin). The header **support link** in `AuthGate` follows
  the same rule: shown to customers (→ `/support`) and support staff (→ `/support/admin`),
  hidden for non-support staff.
- **Permission revalidation on focus.** Permissions resolve fresh server-side, but
  the client caches the last `/auth/me` in component state. So the **dashboard**
  (StaffHome consoles) and **AuthGate** (header support/admin links) re-fetch
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
  logos must be inlined, not `<img>`-referenced.
- **Landing** (`components/marketing/`): a conversion-oriented public marketing
  page (`LandingPage`) structured as **Hero → Problem → Solution → Pricing → FAQ →
  Waitlist → Footer**. The Hero keeps the looping, auto-playing `IdeaToProductDemo`
  reel (client-only, respects `prefers-reduced-motion`) — treated as the page's
  "video". Pricing reads plan numbers from `PLANS` (single source of truth) with
  copy/features from i18n; FAQ is a client accordion; the **Waitlist** posts to the
  real backend (`waitlistApi.join` → `POST /waitlist`) with a success/duplicate/
  invalid state machine. Fully i18n'd (`marketing` namespace, EN + AR, RTL-safe).
  Nav/footer anchor to the section ids. Presentational except the waitlist form.
- **Waitlist (`waitlist`).** A public, unauthenticated signup endpoint for the
  landing page (`POST /waitlist`, `HTTP 200`). `WaitlistService.join` is
  **idempotent** — email is normalized (trim+lowercase), a duplicate returns
  `{ok:true, alreadyJoined:true}` (never leaks prior signup; a unique-constraint
  race is swallowed to the same result). Repo pattern (interface + in-memory +
  Prisma `waitlist_entries`, unique email). Stores optional `locale`/`source`.
  `JoinWaitlistDto` validates the email. Exported service for a future admin view.
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
- **ER diagram export.** The ER diagram (`ErDiagram`) exports five formats, all
  client-side/offline: **Mermaid** (`.mmd`), **Draw.io** (`.drawio` editable
  mxGraph tables via `buildErdDrawio` in `@archivato/shared` — pure/testable),
  and **SVG / PNG / PDF** derived from the *rendered* Mermaid `<svg>` via
  `lib/diagram-export.ts` (`serializeSvg` adds an opaque backing rect from the
  theme-aware container bg; PNG rasterizes SVG→canvas at 2×; PDF opens a
  print-window with the inline vector SVG). No backend — everything derives from
  the already-loaded design + the DOM SVG. Draw.io/Mermaid are string builds;
  SVG/PNG/PDF read `container.querySelector('svg')` at click time.

## Rules

- Build incrementally, one module/slice at a time; **ship backend + matching
  frontend** each slice so the user can click through and verify.
- Never skip DTOs, Guards, validation. Always use the Repository pattern.
- Environment variables for all secrets.
- **Ask before making architectural decisions.**
- After each slice, run `/security-review` + `/code-review` and fix findings.
- Keep `README.md` + this file updated per slice.
