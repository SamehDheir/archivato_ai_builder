# Implementation Progress (slice log)

The project is built incrementally, one vertical slice at a time - each slice
ships a backend feature and its matching frontend so it can be verified by
hand. This log moved here from the root README to keep the front page lean;
it is the authoritative history of what was built and why.

### ✅ Slice 1 — Monorepo + LLM/Agent Core
- npm-workspaces monorepo; `@archivato/shared` domain types.
- `LlmProvider` interface with a **mock provider** (default, offline,
  deterministic) and a **Claude provider** selected at runtime via
  `LLM_PROVIDER`.
- `BaseAgent` + structured `completeJson<T>()` contract.

### ✅ Slice 2 — AI Interview Engine + UI
- Phased **A–E interview** (Understanding → Business Logic → Features → Scale →
  Technical) driven by a deterministic question plan — **kept short (≤ 9
  questions; fewer is fine)**.
- **Tap-to-answer**: questions can carry preset `options` (single-select or
  multi-select checkboxes) so users pick instead of typing; a free-text field is
  always available for extra detail. The adaptive (real-AI) interviewer can emit
  options too. The submitted answer is still a plain string (picks + detail).
- **Completeness scoring** with a **90% gate**: the system summarizes the
  requirements and refuses to proceed until the user explicitly confirms.
- Intent analysis via the `ProductAnalystAgent` (with a deterministic fallback).
- Repository pattern for sessions — **in-memory for now**, Prisma later.
- REST API (`/interview`, `/interview/:id`, `/interview/:id/answer`,
  `/interview/:id/confirm`) with validated DTOs and CORS.
- **Next.js chat UI**: idea form → phased Q&A → live completeness bar →
  requirements summary → confirm.

### ✅ Slice 3 — Requirement Document + UI
- `RequirementEngineerAgent` turns a **confirmed** interview into a formal,
  structured **Requirement Document**: functional (FR-n, prioritized),
  non-functional (NFR-n), user roles, business rules, constraints, assumptions.
- LLM-generated with a **deterministic fallback** built from the interview, so
  the stage always yields a valid document (and demos cleanly in mock mode).
- Gate enforced: requirements can only be generated **after** confirmation.
- Repository pattern for documents — in-memory for now, Prisma later.
- REST API (`/requirements/:sessionId/generate`, `/requirements/:sessionId`).
- **Frontend**: a "Generate Requirement Document" button on the confirmed
  screen renders the full document (FR table, NFRs, roles, rules…), with regenerate.

### ✅ Slice 4 — System Design + UI
- `SystemArchitectAgent` turns a confirmed interview + its Requirement Document
  into a **System Design**: architecture type (monolith / modular_monolith /
  microservices) with rationale, a **tech-stack recommendation**, and a
  **service breakdown** (Auth, Users, Billing, Notifications… with dependencies).
- LLM-generated with a **deterministic fallback** that infers the design from
  the requirements (keyword-driven), so the stage always yields a valid design.
- Gate enforced: requires a confirmed interview **and** a generated requirement
  document (pipeline order: Requirements → System Design).
- Repository pattern for designs — in-memory for now, Prisma later.
- REST API (`/system-design/:sessionId/generate`, `/system-design/:sessionId`).
- **Frontend**: a "Generate System Design" button after the requirement document
  renders architecture, tech-stack table, and a service-card grid.

### ✅ Slice 5 — Database Design + UI
- `DatabaseDesignerAgent` turns the confirmed interview + Requirement Document +
  System Design into a **Database Design**: entities with **primary keys**,
  **foreign keys**, column types, and **relations** (one-to-one / one-to-many /
  many-to-many).
- LLM-generated with a **deterministic fallback** derived from the system
  design's services and the requirement roles (always a `users` table; profile
  tables per role; `invoices`/`notifications`/`reports` per service).
- Gate enforced: requires a confirmed interview, a requirement document, **and**
  a system design (pipeline order: System Design → Database Design).
- Repository pattern for designs — in-memory for now, Prisma later.
- REST API (`/database-design/:sessionId/generate`, `/database-design/:sessionId`).
- **Frontend**: a "Generate Database Design" button after the system design
  renders entity cards (columns with PK/FK/unique badges) and a relations list.

### ✅ Slice 6 — API Design + UI
- `ApiDesignerAgent` turns the upstream chain (interview → requirements →
  system design → database design) into an **API Design**: endpoints grouped by
  module, each with HTTP method, request/response schemas, and status codes.
- LLM-generated with a **deterministic fallback** that derives REST CRUD
  endpoints from the database entities (plus an Auth module: register / login /
  refresh). Server-managed fields (id, timestamps, password_hash) are excluded
  from write schemas.
- Gate enforced: requires the full upstream chain incl. a database design.
- Repository pattern for designs — in-memory for now, Prisma later.
- REST API (`/api-design/:sessionId/generate`, `/api-design/:sessionId`).
- **Frontend**: a "Generate API Design" button after the database design renders
  module sections with colored method badges, paths, status codes, and
  request/response schema columns. Per-part JSON download included.

### ✅ Persistence — PostgreSQL + Prisma
- All pipeline data is now stored in PostgreSQL via Prisma. Every in-memory
  repository was swapped for a Prisma-backed implementation behind the **same
  repository interface** — services were untouched.
- Schema: an `interview_sessions` table plus one table per artifact
  (`requirement_documents`, `system_designs`, `database_designs`, `api_designs`,
  `review_reports`), each storing the artifact as JSONB and cascading on session
  delete.
- `docker-compose.yml` provides a local Postgres; `prisma migrate` manages the
  schema. Verified end-to-end: artifacts survive a full API restart.

### ✅ Slice 7 — Review Engine + UI
- `ReviewerAgent` analyzes the whole pipeline and outputs a **scalability score**
  (0–100), **security issues** and **performance risks** (with severity),
  **missing features**, and **recommendations**.
- LLM-generated with a deterministic, artifact-aware fallback (detects pagination,
  caching, queues; flags weak authorization, missing rate limits, N+1 risks).
- Gate enforced: requires the full pipeline through the API design. Persisted to
  `review_reports`.
- REST API (`/review/:sessionId/generate`, `/review/:sessionId`).
- **Frontend**: a "Run AI Review" button after the API design renders a score
  ring, severity-tagged findings, and recommendations, with JSON download.

### ✅ Slice 8 — Export + UI
- `ExportService` assembles the full pipeline into portable formats:
  **JSON** bundle, **Markdown** report, **OpenAPI 3.0** spec (derived from the API
  + database design, with `:id`→`{id}` paths and component schemas), and a
  **GitHub project structure** (module folders per service + shared/middleware/
  config/utils, spec Step 7). Dependency-free pure builders.
- **PDF** is produced client-side via the browser print dialog — no server PDF
  dependency.
- Gate enforced: requires the design pipeline through the API design (review is
  included if present).
- REST API (`/export/:sessionId/{json,markdown,openapi,openapi.yaml,structure}`).
  The OpenAPI spec is offered as **JSON and YAML** (same document; YAML via a
  pure, dependency-free `toYaml()` serializer in `@archivato/shared`).
- **Frontend**: an Export panel after the review with one-click downloads for
  each format (OpenAPI JSON + YAML) plus "Print / Save as PDF".

### ✅ Slice 9a — Auth core (Register / Login / Refresh) + UI
- Local **register / login** with bcrypt-hashed passwords, **rotating refresh
  tokens** (only a SHA-256 hash is stored; single-use rotation on every refresh),
  and a short-lived **access JWT**.
- **Tokens are delivered as httpOnly cookies** (`archivato_access` site-wide,
  `archivato_refresh` scoped to `/api/auth`) — the browser never exposes them to
  JS. CORS is now locked to `WEB_ORIGIN` with credentials (was `origin:true`).
- `JwtAuthGuard` + `@CurrentUser()` protect routes; login returns a generic 401
  so it never reveals which emails exist.
- Repository pattern for **both** new stores (users + refresh tokens) — in-memory
  for tests, Prisma for the app. New `users` + `refresh_tokens` tables.
- REST API (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`,
  `/auth/me`).
- **Frontend**: an `AuthGate` wraps the whole app — dedicated `/login` and
  `/register` routes (guest-only: signed-in users are redirected home), a header
  with the current user + **Sign out** when signed in.
- Pipeline routes stay public for now; per-user ownership is a focused follow-up.

### ✅ Slice 9b — Email verification (+ UI)
- **Single-use, 24h verification tokens** (only a SHA-256 hash stored) issued on
  registration and on demand. `MailService` picks a transport via `MAIL_PROVIDER`
  or auto-resolves in priority order: **Resend** (HTTP API, recommended for prod —
  `RESEND_API_KEY`, works where SMTP ports are blocked) → **SMTP** (nodemailer,
  `SMTP_HOST`) → **Ethereal preview** (`MAIL_PREVIEW=true`, zero-setup dev inbox +
  logged preview URL) → **console log**. The resolved provider is logged on boot,
  and `preview`/`log` under `NODE_ENV=production` logs a loud warning (they don't
  deliver real mail). Verification + reset sends are **best-effort** at the call
  site, so a transient provider outage never fails sign-up and never lets
  forgot-password enumerate registered emails.
- REST API (`/auth/verify-email`, `/auth/resend-verification`).
- **Frontend**: a `/verify` landing page that confirms the token, plus an
  "unverified" banner with a **Resend** action for signed-in users.

### ✅ Slice 9b — Forgot password (email OTP)
- **One-time 6-digit code** emailed on request (only its SHA-256 hash is stored;
  10-minute expiry, single-use, bounded attempts). Verifying the code sets a new
  password, **revokes all sessions**, and marks the email verified. Responses
  never reveal whether an email exists.
- REST API (`/auth/forgot-password`, `/auth/reset-password`).
- **Frontend**: a "Forgot password?" flow on the login screen — request a code,
  then enter the code + a new password.

### ✅ Slice 10 — AI Chat After Generation (+ UI)
- Once the design is complete, a chat panel lets you refine it in natural
  language ("Add notifications", "Make it scalable to 5 million users").
- A `RefinementAgent` amends the **Requirement Document**, then the existing
  System / Database / API services **regenerate from it** (and the review too, if
  one was already run) so every artifact stays consistent — the keyword-driven
  fallbacks make changes cascade in mock mode.
- The conversation is **persisted** (`chat_messages` table) and replayed on load.
- REST API (`POST /chat/:sessionId`, `GET /chat/:sessionId`).
- **Frontend**: a `ChatPanel` after the API design with example prompts; applying
  a change re-renders the whole design at once.

### ✅ Slice — Adaptive interview + free Groq AI
- The interview now asks **AI-generated, concept-aware questions** instead of a
  fixed plan. A `GroqLlmProvider` (free, OpenAI-compatible) drives the interview
  when `GROQ_API_KEY` is set, via a dedicated `INTERVIEW_LLM_PROVIDER` — so the
  free key flips only the interview to real AI while design agents stay on the
  default. Falls back to the deterministic question plan when unavailable.

### ✅ Slice 10 — AI Chat After Generation
- A post-generation chat refines the design in natural language ("Add
  notifications", "Make it scalable to 5M users"): the requirements are amended
  and the system/database/API designs (and the review, if present) regenerate
  together. Conversation persisted; `POST/GET /chat/:sessionId`.

### Resume
- The web app remembers the active session (localStorage) and rehydrates the
  interview + every generated artifact on load, so a refresh continues where you
  left off.

### ✅ Slice 9c — OAuth (Google / GitHub)
- Sign in with Google or GitHub via a server-side authorization-code flow (no
  extra SDK — native `fetch`). Accounts are **linked by verified email**: an
  OAuth login for an existing email attaches the provider; otherwise a new
  password-less, email-verified account is created. CSRF-protected with a `state`
  cookie; a provider is enabled only when its client id + secret are set.
- REST API (`GET /auth/oauth/providers`, `GET /auth/oauth/:provider/start`,
  `GET /auth/oauth/:provider/callback`).
- **Frontend**: "Continue with Google / GitHub" buttons on the auth screen,
  shown only for configured providers; callback errors surface on `/login`.

### ✅ Slice 11 — Per-user pipeline ownership ("My projects")
- Every interview session is now owned by the authenticated user (`userId` FK).
  A `SessionOwnerGuard` protects **all** pipeline routes (previously public):
  non-owners get a `404` (no existence leak), unauthenticated requests `401`.
- `GET /interview` lists the signed-in user's projects; the home screen shows a
  **"My projects"** list to resume any past session.

### ✅ Slice 11 — Async generation (BullMQ + Redis)
- Heavy generation stages run on a background worker. The client enqueues a job
  and polls its status, with a **live progress bar**, instead of blocking on a
  long request. Jobs are owner-scoped and a job's status can only be read for
  the session it belongs to.
- REST API (`POST /jobs/:sessionId/:stage`, `GET /jobs/:sessionId/:jobId`).

### ✅ Slice 11 — UI rebuilt on Tailwind CSS + shadcn/ui
- The entire web app was migrated to **Tailwind CSS + shadcn/ui** with a cohesive
  dark theme (Card, Button, Badge, Input, Select, Tabs, Table, Progress, Alert…).

### ✅ Slice 13 — Architecture diagrams (Mermaid)
- The structured designs are turned into **rendered diagrams** shown in a
  **Diagrams** tab: **Flow Chart, Sequence, Class, ERD, Microservices,
  Deployment**. Source is built deterministically from the system / database /
  API designs (no LLM) as **Mermaid** and rendered to SVG in the browser, with
  a "View source / Copy Mermaid" option (paste into Mermaid Live, PlantUML, or
  draw.io). REST API (`GET /diagrams/:sessionId`), owner-scoped.

### ✅ UI — Tabbed project view
- The confirmed project view is organized into **tabs** (Requirements · System ·
  Database · API · Review · Export · Refine · History) instead of one long
  scroll — one stage at a time, with downstream tabs unlocking as artifacts are
  generated. `page.tsx` was split into focused components
  (`ProjectsDashboard`, `InterviewPanel`, `ProjectStages`, …).

### ✅ Slice 12 — Project version history (compare + restore)
- **Every modification snapshots the whole project** (all artifacts together) as
  the next sequential version — captured after each async stage generation and
  each chat refinement (identical no-op snapshots are deduped).
- **Compare** any two versions in a side-by-side JSON diff, and **Restore** any
  version in one click (the project is rewritten to match that snapshot exactly,
  and the restore is saved as a new version, so history is never lost).
- REST API (`GET /versions/:sessionId`, `GET /versions/:sessionId/:version`,
  `POST /versions/:sessionId/:version/restore`), all owner-scoped.

### ✅ Slice — SuperAdmin dashboard + analytics
- **Role-based admin**: a `role` (`user`/`admin`) on users, bootstrapped from an
  **`ADMIN_EMAILS`** allowlist (listed emails are auto-promoted on login). An
  `AdminGuard` protects every `/admin` route; admins can promote/demote or delete
  users from the dashboard (never themselves). Admin accounts are **stats-only** —
  they can't create projects (the dashboard points them to `/admin` instead).
- **Full traffic analytics**: a public `POST /analytics/track` beacon records
  anonymous landing **pageviews** (cookie-scoped visitor id), while
  **signup/login/generate** events are logged server-side. All best-effort — a
  tracking failure never breaks the app.
- **`/admin` dashboard**: live KPIs (users, projects, Pro subscribers + MRR,
  pageviews, unique/active visitors, generations), 30-day signup & pageview trend
  charts, projects-by-status, plan mix, top pages/referrers, and a paginated user
  management table. Self-guards (non-admins bounce to the app); an admin-only
  header link opens it.
- **Super Admin is seeded on boot.** Set `SUPER_ADMIN_EMAIL` +
  `SUPER_ADMIN_PASSWORD` in `apps/api/.env` and a pre-verified super-admin account
  is created on startup — log in directly, no self-registration. (The legacy
  `ADMIN_EMAILS` promote-on-login allowlist still works but is empty by default.)

### ✅ Slice — Customer Support Center + AI Support Assistant
- A professional **ticketing system** (Zendesk/Linear-style) reachable from the
  **Support** header link (`/support`): dashboard with per-status counts, a
  searchable/filterable **My Tickets** list, **Create Ticket** (subject,
  category, priority, optional related project), and a chat-like **ticket
  conversation** (Markdown + code blocks + attachments) with a full **timeline**
  of every action (created / replied / status & priority changes / assigned /
  closed / reopened / AI suggestion). Statuses: open · in progress · waiting for
  customer · waiting for admin · resolved · closed. Customers can reply, close,
  and reopen; internal notes stay admin-only.
- **Three-layer AI Support Assistant** (free for everyone, offline in mock mode,
  every response has a deterministic fallback): **(1) pre-ticket deflection** —
  describe the problem and the AI searches the Knowledge Base + your own past
  tickets and proposes a solution before a ticket is opened; **(2) in-ticket
  assistant** — one click gives an issue summary, root-cause, suggested fix, and
  a ready-to-send reply draft; **(3) admin copilot** — the same plus urgency,
  priority, assignment, and similar tickets across the system.
- **Attachments** (images / PDF / ZIP / TXT / JSON / logs) are stored as
  metadata; for text-based files the extracted text is persisted inline so the
  AI can analyze uploaded logs. **Knowledge Base** is a placeholder listing whose
  seed articles also power the deflection layer. **Admin Support Panel**
  (`/support/admin`, admin-guarded) adds a metrics dashboard (open / waiting /
  critical / unassigned counts, avg first-response & resolution time, and
  AI-flagged tickets that need attention), an all-tickets table with filters, and
  per-ticket management (status / priority / category / assignment / notes /
  copilot). **Notification hooks** are stubbed (in-app + email + AI smart
  alerts), ready to wire to a real channel.
- REST API under `/support` (customer) and `/support/admin` (admin). All routes
  are owner-scoped (a customer only ever sees their own tickets; a non-owner gets
  a 404, no existence leak); the AI never reads another user's ticket data.

### ✅ Slice — RBAC (dynamic roles & permissions)
- The monolithic `admin` is replaced by a **dynamic, DB-managed role system**.
  The **permission catalog is code-defined** in `@archivato/shared` (a permission
  only exists because a guard enforces it), while **roles, their granted
  permissions, and who holds them are editable at runtime**. A user can hold
  **multiple roles**; their effective permissions are the **union**.
- **Seeded system roles**: **Super Admin** (full catalog), **Support Agent** (all
  `support:*` — works tickets without platform access), **Billing Admin**
  (`billing:manage`), and **User** (none; acts via ownership). `ADMIN_EMAILS`
  bootstraps the first Super Admin; everyone else is assigned in the UI.
- Enforcement is a **`PermissionGuard` + `@RequirePermissions(...)`** decorator.
  `/admin` split into `admin:analytics` / `admin:users:read` / `admin:users:manage`;
  the Support staff panel now needs `support:read_all` (so a Support Agent can
  work tickets without being a super admin). The web mirrors this with a shared
  `hasPermission()` helper driving nav + self-guards.
- **Role management UI** at **`/admin/roles`** (needs `admin:roles:manage`):
  create/edit/delete roles with a grouped permission grid, and assign roles to
  users. Super Admin's permissions are locked to the full catalog (no lock-out)
  and system roles can't be deleted. REST API under `/admin/roles`.

### ✅ Slice — Role-aware interfaces & staff provisioning
- **Staff = console-only accounts.** A user who holds *any* permission is
  **staff** (`isStaffUser`) and **cannot create projects** — `POST /interview`
  403s them (generalizing the old admin-only block to Support/Billing agents).
- **Role-aware dashboard.** `/dashboard` shows a **`StaffHome`** to staff instead
  of the project creator: one card per console their permissions grant (Support,
  Analytics, Roles, Billing) — the **union** of their roles. Regular users still
  get the project creator. Fully i18n'd (EN + AR).
- **Super Admin provisions staff without self-registration.** `POST
  /admin/roles/provision-user` (`admin:roles:manage`) creates a **pre-verified**
  account with a **generated strong password** (returned once), **bypassing** the
  one-account-per-device gate, and assigns RBAC roles. The `/admin/roles` page has
  a "Provision staff account" card that shows the password once with a copy button.

### ✅ Slice — Professional landing page + waitlist
- The public landing page was redesigned into a conversion flow: **Hero (with the
  looping build video) → Problem → Solution → Pricing → FAQ → Waitlist**. Pricing
  reads from `PLANS`; FAQ is an accordion; copy is fully i18n'd (EN + AR, RTL).
- **Waitlist** is a real backend: a public `POST /waitlist` (repo pattern +
  `waitlist_entries` table) with **idempotent**, normalized email signup. The
  landing form posts to it with success / already-joined / invalid states.

### ✅ Slice — Legal pages + cookie consent
- Public **`/privacy`** and **`/terms`** pages, rendered from one data-driven
  `LegalDocument` component and a bilingual **`legal`** i18n namespace (EN + AR,
  RTL-safe). The content honestly reflects the app (account data, hashed device
  fingerprint, AI processing of your input, Paddle billing, self-serve account
  deletion + export) and carries `[LEGAL_ENTITY]` / `[JURISDICTION]` /
  `[CONTACT_EMAIL]` **placeholders to fill before launch**; "contact us" points to
  the in-app Support Center. Linked from the landing footer's new **Legal** column.
- A **cookie-consent banner** (shown on every page until you choose) gates
  **analytics only** — essential cookies (auth, locale, theme) always run. The
  anonymous pageview beacon + its visitor cookie fire **only after consent**; the
  choice persists in `localStorage` and updates the tracker live (no reload).

### ✅ Slice — Production hardening (health, errors, deploy)
- **Health probes** (root-level, un-throttled, outside the `/api` prefix):
  `GET /health` (liveness) and `GET /health/ready` (readiness — checks Postgres
  **and** Redis, returns `503` if either is down) for load balancers / orchestrators.
- **Global exception handling**: an `AllExceptionsFilter` preserves known HTTP
  error bodies, returns a generic 500 for unexpected errors (no stack/detail leak),
  logs 5xx with request context, and reports to **Sentry** when `SENTRY_DSN` is set
  (a no-op otherwise).
- **Deployment**: multi-stage **Dockerfiles** for the API and web (Next standalone
  output), a **`docker-compose.prod.yml`** (db + redis + api + web, with
  healthchecks), a **`scripts/backup-db.sh`** pg_dump/retention script, and a full
  **[`DEPLOY.md`](./DEPLOY.md)** guide (single-host and managed-hosting paths).

### ✅ Slice — Code scaffolding (design → runnable backend)
- Closes the "last mile": a Pro-only stage that turns the confirmed design into a
  **runnable NestJS + Prisma backend**. Fully **deterministic** (no LLM):
  `buildBackendScaffold()` in `@archivato/shared` maps entities/relations → a
  `prisma/schema.prisma` and API modules/endpoints → NestJS
  modules/controllers/services + class-validator DTOs, plus root project files.
  The output always compiles (FKs are documented scalar fields; service methods
  are typed "Not implemented" stubs; a PK is synthesized when missing).
- **Two deliveries**: **Download ZIP** (`GET /api/scaffold/:id/zip`) and **Push to
  GitHub** (`POST /api/scaffold/:id/github`). The push creates the repo with
  `auto_init` (GitHub refuses a tree on an empty repo), then commits the scaffold
  onto `main`; the GitHub client retries transient failures with backoff.

### ✅ Slice — "Connect with GitHub" (one-click push)
- Instead of pasting a token, a **Connect with GitHub** button runs an OAuth popup
  and stores a per-user connection so pushes need no token. The access token is
  **encrypted at rest** (AES-256-GCM); the OAuth `state` is HMAC-signed to bind the
  callback to the user. A **Personal Access Token** remains as a fallback (used
  once, never stored).
- Reuses your existing **login GitHub OAuth App** — set the scaffold callback URL
  (`…/api/scaffold/github/connect/callback`) on it and leave
  `GITHUB_SCAFFOLD_CLIENT_ID/SECRET` empty (they fall back to `GITHUB_CLIENT_ID/SECRET`).
  New endpoints: `GET /api/scaffold/github/connect/start`, `…/connect/callback`,
  `GET/DELETE /api/scaffold/github/connection`.
- **Web**: the "Generate code" section shows Connect → connected state (with
  Disconnect) → push, plus a "use a token instead" toggle. i18n'd (EN + AR).

### ✅ Slice — Streaming generation (live "narration" console)
- Generating a pipeline stage now streams a **live narration** of the work over
  **Server-Sent Events** (`GET /api/stream/:sessionId/:stage`) instead of a flat
  progress bar — a terminal-style console types out each step as the design takes
  shape (roles found → requirements derived → services decomposed → endpoints
  defined → review scored), with an active-step spinner and a blinking caret.
- Because artifacts are structured JSON and every agent has a deterministic
  offline fallback, we stream a **human-readable narration derived from the
  finished artifact** (the pure, unit-tested `buildNarration()` in
  `@archivato/shared`), not raw JSON tokens — so it reads identically in mock mode
  and with a real provider. The endpoint runs the **same generation** the async
  worker does (persist + version snapshot); the **Pro gate is enforced server-side
  before any generation**; and the **poll-based `/jobs` path remains the fallback**
  (the web client degrades to it automatically if SSE is blocked or the auth cookie
  needs a refresh).

### ✅ Slice — Annual Pro plan (annual billing option)
- Pro can now be billed **annually — $182/yr (20% off $228, ~$15.17/mo)** alongside
  the $19/mo option. Annual is modeled as a **billing cadence, not a new tier**: an
  orthogonal `billingCycle` (`monthly` | `annual`) changes only the price, the
  period length, and the Paddle price id — the Pro entitlement (5-project quota, the
  freemium unlock) is byte-for-byte identical, so none of the `plan === 'pro'` logic
  changed.
- Cadence is chosen at **checkout** (`POST /api/billing/checkout` now takes an
  optional `{ billingCycle }`); switching cadence is just a fresh checkout / new
  period (mock applies it instantly with a 365-day period; Paddle handles proration
  as Merchant-of-Record via `PADDLE_PRICE_ID_ANNUAL`). The **in-app upgrade modal**
  and the **landing pricing** both get a Monthly/Annual toggle with the savings
  badge; **settings** shows an "Annual" badge; and the billing-admin **MRR
  normalizes** annual subscriptions to their monthly-equivalent revenue.

### ✅ Slice — Notifications wired (in-app bell + email)
- The Support Center's notification hooks are no longer a stub: every ticket event
  now delivers **two real channels** to the **involved party** — an **in-app
  notification** (a new header **bell** with an unread badge + dropdown) and an
  **email** via the existing `MailService`. Recipients are scoped (no staff
  broadcast): a new ticket / status change confirms to the customer; a reply
  notifies the *other* side; an assignment notifies the assignee; an AI
  smart-alert goes to the assignee. Everything is **best-effort** — a
  notification or mail failure never breaks the ticket action.
- New **`notifications`** module (repo pattern + `notifications` table):
  owner-scoped `GET /api/notifications` (items + unread count),
  `POST /api/notifications/read-all`, `PATCH /api/notifications/:id/read`. The web
  bell polls every 60s (and on tab focus), marks read, and deep-links to the
  ticket. Emails HTML-escape the user-supplied subject and carry an absolute
  deep-link; `MailService` gained a public `sendNotificationEmail`.

### ✅ Slice — Per-flow sequence diagrams
- The **Diagrams** tab's single Sequence diagram is now a **per-flow** set: pick
  any endpoint (grouped by module) and see its own sequence diagram. Auth flows
  (login / register / refresh) are specialised — credential check, password-hash
  verify, token issuance + `Set-Cookie` — while reads show a cache lookup and
  writes an optional queue enqueue (both driven by the system design's tech
  stack). Fully **deterministic** (no LLM): `buildSequenceFlows()` in
  `@archivato/shared` builds one Mermaid `sequenceDiagram` per endpoint. The
  generic Sequence entry stays as an "Overview (happy path)"; `ProjectDiagrams`
  gained a `flows: SequenceFlow[]` field. No new endpoints — `GET /api/diagrams/:id`
  now returns the flows too. i18n'd (EN + AR).

### ✅ Slice — "Explain this decision" (architecture rationale on demand)
- The **System Design** view gained an **Explain** button next to the
  architecture, every tech-stack pick, and every service. Clicking it asks a new
  **`ArchitectExplainer`** agent for the decision's **rationale, tradeoffs,
  alternatives (and why-not), and risks** — rendered in a modal. Like every
  agent it's **LLM-driven with a deterministic, knowledge-based fallback**
  (`buildDecisionExplanation()` in `@archivato/shared`), so it always returns a
  coherent answer offline and in tests.
- New endpoint `POST /api/system-design/:sessionId/explain` (owner-guarded,
  `THROTTLE_AI`), body `{ kind: 'architecture'|'tech'|'service', key }`. The
  result is **ephemeral** — nothing is persisted. Available on the (free)
  System Design stage. i18n'd (EN + AR).

### ✅ Slice — Security threat model (STRIDE)
- A new **Security** tab (Pro) runs a **STRIDE threat model** of the generated
  design: for each category — **Spoofing, Tampering, Repudiation, Information
  Disclosure, Denial of Service, Elevation of Privilege** — it enumerates
  concrete threats against the system's components/entry points, each with a
  **severity** and a **mitigation**, plus the **trust boundaries** and
  **assumptions**. A new **`ThreatModeler`** agent generates it — **LLM-driven
  with a deterministic heuristic fallback** that inspects the design (auth &
  rate-limiting, roles/permissions, id-scoped routes → IDOR, sensitive entities,
  cache/queue), so it always yields a complete model offline and in tests.
- Standalone Pro artifact (own `threat_models` table; not in version snapshots),
  mirroring roadmap/cost: `POST /api/threat-model/:sessionId/generate`
  (owner-guarded + `ProGuard` + `THROTTLE_AI`) and `GET /api/threat-model/:sessionId`.
  Web: a `ThreatModelView` grouping threats by STRIDE category with a severity
  tally + JSON download. i18n'd (EN + AR).

### ✅ Slice — Test / QA plan
- A new **QA Plan** tab (Pro) turns the generated design into a **structured
  testing plan**: an overall strategy plus suites of concrete, verifiable test
  cases grouped by type — **unit, integration, end-to-end, security,
  performance, acceptance** — each case with an expected result and priority,
  plus **coverage goals**, recommended **tooling** (derived from the stack), and
  **out-of-scope** notes. A new **`QaPlanner`** agent generates it — **LLM-driven
  with a deterministic fallback** that maps services → unit tests, API modules →
  integration tests, key flows → e2e, roles/authz → security, list endpoints →
  performance, and functional requirements → acceptance (with sequential `TC-n`
  ids), so it always yields a complete plan offline and in tests.
- Standalone Pro artifact (own `qa_plans` table; not in version snapshots):
  `POST /api/qa-plan/:sessionId/generate` (owner-guarded + `ProGuard` +
  `THROTTLE_AI`) and `GET /api/qa-plan/:sessionId`. Web: a `QaPlanView` grouping
  suites by test type with a per-type tally + JSON download. i18n'd (EN + AR).

### ✅ Slice — Editable Knowledge Base (real store + CRUD)
- The Support Center's Knowledge Base is no longer a static in-code seed: it's a
  real **`kb_articles`** store (repository pattern: interface + in-memory +
  Prisma) with **staff CRUD**. On first boot the curated set is **seeded only
  when empty**, so AI deflection and the reader keep working out of the box.
- Articles carry a **draft/published** state — **drafts are hidden from customers
  and excluded from AI deflection**. A new **`support:kb:manage`** permission
  (held by Support Agent + Super Admin) gates authoring; the keyword scorer is now
  a pure, shared `searchArticles()` used by both public search and deflection.
- **Public** (any signed-in user): `GET /api/support/kb?q=` (published,
  keyword-ranked) and `GET /api/support/kb/:id` (full body). **Admin**
  (`support:kb:manage`): full CRUD under `/api/support/admin/kb`. **Web**: the KB
  page is now a real **reader with live search + article detail pages** (Markdown
  body), plus a **Manage KB** console (`/support/admin/kb`) to create/edit/publish/
  delete. i18n'd (EN + AR).

### ✅ Slice — Unified admin console (permission-aware sidebar)
- Every staff/admin area now shares one professional shell: a persistent
  **left sidebar** (below the app header) that lists **only the consoles the
  viewer's roles grant** — Overview, Support (Tickets · Knowledge Base),
  Platform (Analytics · Roles), Billing — grouped and with an active-state
  highlight. A single `admin-nav` config drives both the sidebar and the staff
  landing, so a support agent sees only Support while a super admin sees
  everything; the sidebar re-resolves on tab focus (a revoked permission's item
  disappears without a reload).
- The shell (`AdminShell`) is applied via **route-group layouts** for `/admin/*`
  and `/support/admin/*`, and the staff **`/dashboard`** now shows a redesigned
  **console overview** (a card per reachable console) inside it — replacing the
  old card grid. Regular users' project dashboard is unchanged. The top **navbar
  was decluttered**: the redundant Admin quick-link is gone and the Support link
  shows for customers only (staff navigate via the sidebar). i18n'd (EN + AR,
  RTL-safe).

### ✅ Slice — Agent quality upgrade (prompts, outputs & provider hardening)
- **All 14 AI agents** (product analyst, interviewer, requirement engineer,
  system architect, database designer, API designer, reviewer, product manager,
  roadmap planner, refiner, threat modeler, QA planner, architect explainer,
  support assistant) were re-authored to a single professional standard: each
  **system prompt** now defines a senior role, an explicit method, and a precise
  **output standard** (specific to *this* system, actionable, correct
  terminology, no invented scope, complete and internally consistent, strict
  JSON only), and each **input prompt** passes richer, structured upstream
  context with field-level guidance. The artifact **schemas are unchanged**, so
  every view, export, and version snapshot keeps working.
- **Provider hardening.** The JSON extractor is now a string/escape-aware
  **balanced-brace scan** with trailing-comma repair (resilient to fences,
  surrounding prose, and truncated output). The **Claude** provider only sends
  sampling params (`temperature`) to models that still accept them — so setting
  `ANTHROPIC_MODEL` to a newer model (Opus 4.7/4.8, Sonnet 5) no longer 400s
  every call — and marks the stable system prompt for **prompt caching**. The
  **Groq** provider (the default free real-AI path) uses native
  **`response_format: json_object`** so structured output is guaranteed, not
  coaxed.
- **The deterministic fallbacks stay** — they are a resilience layer (offline
  mock mode + tests), not "mock data." To get real AI everywhere, set a provider
  key (a free `GROQ_API_KEY`, with `LLM_PROVIDER` unset, flips the whole
  pipeline) and restart the API; the boot log confirms `Agent LLM provider:
  groq`. Full suite green (43 suites, 280 tests).

### ✅ Slice — YAML OpenAPI export
- The generated **OpenAPI 3.0** spec can now be downloaded as **YAML** as well as
  JSON — the same document, serialized by a pure, dependency-free `toYaml()` in
  `@archivato/shared` (no new package; block-style, quotes keys/strings only when
  ambiguous, correct for the numeric status-code and `{id}` path keys). New route
  `GET /api/export/:sessionId/openapi.yaml` (`application/yaml`), Pro-gated and
  owner-scoped like the rest of export. The Export panel splits the OpenAPI
  download into **JSON** and **YAML** buttons. i18n'd (EN + AR). Unit-tested
  (serializer edge cases) + an integration test on the real spec.

### ✅ Slice — Richer export formats (SQL, Postman, "Download all")
- The Export tab now covers the whole delivery workflow, not just documents. Three
  developer-facing formats were added, all from **pure, dependency-free builders**
  in `@archivato/shared`:
  - **SQL DDL** (`schema.sql`) — the database design as runnable PostgreSQL:
    quoted identifiers, mapped column types, primary keys inline, and foreign keys
    emitted as `ALTER TABLE … ADD CONSTRAINT` after all tables so it runs in any
    order. `GET /api/export/:id/schema.sql`.
  - **Postman collection** (v2.1) — the API design as an importable collection
    (folder per module, `{{baseUrl}}` variable, `:id` path vars, query params, and
    schema-derived JSON bodies on writes) for Postman/Insomnia.
    `GET /api/export/:id/postman`.
  - **Download all** (`.zip`) — one click bundles README.md + bundle.json +
    openapi.json/yaml + schema.sql + postman_collection.json + structure.json
    (server-side via the existing `jszip` dep; the pipeline is fetched once).
    `GET /api/export/:id/all.zip`.
- All Pro-gated + owner-scoped like the rest of export. Web: a prominent
  **Download all** button plus **SQL schema** / **Postman** downloads in the
  Export panel. i18n'd (EN + AR). Unit-tested builders + integration/zip tests.

### ✅ Slice — Profile pictures (avatar + initials fallback)
- Users can now set a **profile picture**. When none is set, a stable, colored
  **initials avatar** (derived from the display name) is shown everywhere the user
  appears — the header, the settings Profile card, and the admin users table.
- **Upload** is inline with no object store: the browser **center-crops + resizes
  the image to a 256px square JPEG** (kept tiny so the JSON body stays under the
  API's default limit) and stores it as a base64 `data:` URI on a new nullable
  `avatarUrl` column. Set via `PUT /api/auth/avatar` (validated data URI, size
  cap), remove via `DELETE /api/auth/avatar` — both owner-scoped.
- **OAuth sign-in captures the provider avatar** (Google `picture` / GitHub
  `avatar_url`) as the initial picture, backfilling a picture-less account but
  never overwriting one the user set themselves. A reusable `UserAvatar` component
  handles the image/initials switch (and falls back to initials if an image fails
  to load). i18n'd (EN + AR); unit-tested (`initialsFromName`, OAuth capture).

### ✅ Slice — Frontend test + lint harness (`apps/web`)
- Closed a real coverage gap: the backend had ~300 Jest tests but the **web app
  had no test runner and no working ESLint** (`next lint` was uninitialized). Added
  a **Jest + React Testing Library** setup through **`next/jest`** (jsdom, SWC
  transform, CSS/asset mocks, tsconfig-alias mapping) with the first component
  tests (`UserAvatar`, `AccountMenu`), run via `npm run test:web`.
- Wired **ESLint** via **`eslint-config-next`** (`next/core-web-vitals`) so
  `npm run lint:web` runs non-interactively and passes clean (also fixed a stale
  `react-hooks/exhaustive-deps` case in `AdminShell`). Colocated `*.test.tsx`
  convention (vs the API's `*.spec.ts`); i18n-dependent chrome mocks
  `useTranslation`.

### ✅ Slice — Azure OpenAI provider
- Added **`AzureOpenAiLlmProvider`** behind the existing `LlmProvider` seam, so
  the whole pipeline (interview + all 14 agents) can run on **Azure OpenAI** — no
  agent code changed. Enable with `LLM_PROVIDER=azure`, or just set
  `AZURE_OPENAI_API_KEY` (Groq keeps priority when both keys are present).
- Shape-compatible with OpenAI, so it mirrors the Groq provider (native
  `response_format: json_object` for guaranteed structured output), with the three
  Azure specifics handled: the model comes from the **deployment name in the URL**
  (an explicit `model` option maps onto that segment), auth is an **`api-key`
  header** rather than a Bearer token, and requests carry an **`api-version`**.
  Native `fetch`, no SDK. Unit-tested (URL/auth/JSON-mode/error paths + provider
  resolution precedence).

### ✅ Slice — Waitlist admin view
- Realized the waitlist service's "future admin view": a read-only, **Super-Admin
  only** console at **`/admin/waitlist`** listing everyone who joined from the
  landing page — a total KPI, debounced email/source search, a paginated
  newest-first table (email · locale · source · joined), and a one-click **CSV
  export**. Sits in the AdminShell sidebar under Platform.
- Backend: `GET /api/waitlist/admin?q=&page=&pageSize=` (`WaitlistService.list` →
  a client-safe `WaitlistEntryView` page, page size capped at 200), gated by
  `admin:roles:manage` (the app's super-admin gate). Repository gained a filtered
  `list()` across the in-memory + Prisma impls. Unit-tested (ordering, pagination,
  case-insensitive search, input clamping).

### ✅ Slice — Visitor country (waitlist + analytics geolocation)
- The waitlist admin table and the analytics dashboard now show **where visitors
  are from**: a **Country** column (+ CSV field) on `/admin/waitlist`, and a **Top
  countries (30d)** breakdown on `/admin`. Country is resolved server-side at
  signup (`POST /waitlist`) and on the pageview beacon (`POST /analytics/track`);
  only the 2-letter code is stored, never the IP.
- Resolution is **hybrid + cheapest-first** (`common/geo.ts`): a CDN/edge country
  header (Cloudflare `CF-IPCountry`, Vercel `x-vercel-ip-country`, …), then an
  **offline `geoip-lite`** lookup on the client IP. `geoip-lite` is an **optional
  dependency, lazy-loaded** — behind a CDN the header wins and the ~150 MB DB never
  loads, and a lean production image can drop it entirely (`npm ci --omit=optional`,
  see DEPLOY.md) and fall back to header-only. `GEOIP_FALLBACK=false` forces
  header-only. Unit-tested (header precedence, code normalization, graceful null).
  i18n'd EN + AR (country names localized via `Intl.DisplayNames`).

### ✅ Slice — Activation & onboarding (sign-up → first artifact)
- Attacks the drop-off between sign-up and the first generated artifact (from a
  ux-consultant pass on the flow):
  - **Starter-idea chips** — 5 concrete, tappable example ideas above the idea box
    (`StarterIdeas` in `ProjectsDashboard`, data in `lib/starter-ideas.ts`). Tapping
    **prefills** idea+industry+scale (still editable) so a first-timer never faces a
    blank textarea. Chosen over an abstract "SaaS/marketplace" template gallery,
    which would just relocate the blank-page problem. A soft hint replaces the silent
    10-char gate.
  - **Read-only Example project** — a persistent banner opens `ExampleProjectView`, a
    tabbed read-only tour of a **finished sample** ("HomeHelper" booking app) rendered
    from a static fixture (`lib/example-project.ts`) through the real artifact views.
    It previews **every AI agent** — Interview, Vision, Requirements, Architecture,
    Database, API, Review, Roadmap, Cost, Security (STRIDE), QA Plan — in the same tab
    order as a real project. The cost figures are **derived from the example design**
    by the same deterministic `estimateCosts()` the real stage uses, so they can't
    drift from the fixture. **No backend, no session, no quota impact** — it shows the
    payoff before the interview. `SystemDesignView` gained an `interactive` flag to hide
    the API-backed "Explain" buttons in the demo.
  - **Quick wins** — the interview counter now reads **"Question N of up to M"**
    (`INTERVIEW_MAX_QUESTIONS`, single source for the API cap); the quota/upsell
    banner is **hidden until the user owns ≥1 project**; and **confirming the
    interview auto-generates Requirements** (no redundant Generate click).
- i18n EN + AR (`dashboard.starters.*` / `dashboard.example.*` / `interview.questionN`);
  Example fixtures covered by a render smoke test.

### ✅ Slice — Landing conversion, site metadata & Lighthouse 100s
- **Landing page**: hero CTA now leads with the product (**Start building — free**
  → `/register`) instead of the waitlist (kept as its own section); new
  **"What you get"** section — a grid of all 12 pipeline artifacts with the
  Free/Pro cutline marked (threat model, QA plan, cost estimate, diagrams, and
  scaffold were previously invisible to visitors); hero proof stats (product
  facts, not invented social proof); scroll-aware sticky **`LandingHeader`**
  (transparent over the hero → solid on scroll, active-section highlight via
  IntersectionObserver) + a floating RTL-safe **`BackToTop`** button; smooth
  anchor scrolling (`prefers-reduced-motion`-gated) with `scroll-mt` so headings
  clear the sticky bar. Fully i18n'd EN + AR.
- **Brand icon rebuilt** for 16 px legibility (coarse truss "A" mark — 2 strokes,
  3 nodes) and synced across `app/icon.svg`, the `public/` brand SVGs, and
  `LogoMark`. Fixed the production bug where `metadata.icons` **suppressed the
  favicon entirely** (it overrides Next's file conventions instead of merging).
- **Metadata/SEO**: generated 1200×630 OG/Twitter card (`lib/og.tsx` — scrapers
  don't render SVG, so it's a real PNG), `apple-icon.tsx`, `manifest.ts`,
  `robots.ts`, `sitemap.ts`, canonical URL, and JSON-LD
  (`SoftwareApplication` + `FAQPage`) emitted from the server component;
  `lib/site.ts` is the single source of the machine-facing identity.
- **Lighthouse: 100/100/100/100** (desktop preset, local prod build; was
  57/98/96/100 deployed). The big lever was a **route-group split** — the authed
  app's providers + `AuthGate` moved to `app/(app)/layout.tsx`, so the landing
  no longer downloads/hydrates the app (landing First Load JS **200→157 kB**);
  **i18n bundles code-split into three tiers** (eager public EN / lazy app EN
  awaited by AuthGate / lazy AR on locale switch); the landing nav no longer
  fires `/auth/me` for anonymous visitors (killed the console 401 →
  Best-Practices 100); `<main>` landmarks (A11y 100). Deployed-site follow-up:
  the hero reel's 2.6s autoplay read as a never-settling page (**Speed Index
  6.8s** → autoplay now arms on first user interaction, 8s fallback), and the
  pageview beacon got a **4s timeout** so a cold Render API can't hold
  network-idle open for its ~50s wake.

### ✅ Slice — GitHub Actions CI
- **CI** (`.github/workflows/ci.yml`), on every push/PR to `develop`/`main`: one
  `checks` job — build shared → prisma generate → lint api+web → unit tests
  api+web → build api+web. No service containers and no secrets are needed: every
  repository has an in-memory implementation and every agent has a deterministic
  fallback, so the suite is hermetic. A broken build now fails in CI instead of
  being discovered by Vercel/Render.
- A **Playwright full-funnel e2e smoke was built and then removed.** It was flaky
  for an instructive reason: Playwright locators **auto-wait**, so an unbounded
  `textContent()`/`inputValue()` inside a polling predicate parks on an element
  that has already unmounted (the interview's question counter disappears the
  moment the completeness gate closes) and burns the whole timeout without ever
  re-checking the success condition — failing a page that was sitting there
  correct and ready. Rather than ship a suite that cries wolf, it was dropped;
  the lesson is recorded in CLAUDE.md for whoever reintroduces one.

### ✅ Slice — Public share links (read-only page for a finished design)
- The organic growth loop: a Pro user mints an **unguessable public link**
  (`/s/<token>`) to a completed design, and **anyone can open it without an
  account** — the design chain (requirements → architecture → database → API)
  plus the AI review, rendered read-only through the **same artifact views the
  owner sees** (the `ExampleProjectView` pattern: the views are pure functions of
  their artifact, so they need no session). The page ends in a **"Built with
  Archivato"** CTA — the reader is a stranger who just saw proof of the product.
- **Owner controls** live in the Export tab (`ShareLinkCard`): create → copy →
  view count → revoke. Minting is **Pro-gated** (`ProGuard`; a 402 opens the
  upgrade modal in place); **reading and revoking are not**, so a user who
  downgrades can still kill a link they already published. Creating is
  **idempotent** (sharing twice never invalidates a link already sent out), and
  **revoke is a hard delete** — the token 404s forever and re-sharing mints a new
  one.
- **What a link holder can see is the whole contract** (`SharedProject` in
  `@archivato/shared`): no interview transcript (the user's own words about their
  business), no owner identity, and **not even the internal session id** — every
  artifact is stamped with it, so the public projection substitutes the token.
  The pipeline gate comes free from reusing `ExportService.bundle()` (409 until
  the API design exists); a design that later regresses 404s rather than leaking
  a 409 a stranger can't act on.
- **Unlisted, not published.** The design is someone's business idea, so the page
  is `noindex` + disallowed in `robots.ts` — while the **per-project OG card**
  (`lib/og.tsx` `shareOgImage`: their project name + architecture/services/tables/
  endpoints) still unfurls in Slack/X/LinkedIn, which is where the loop actually
  happens.
- New `share` module (repo pattern: interface + in-memory + Prisma, `share_links`
  table) with an owner controller (`/api/share/:sessionId`) and a **public,
  un-throttled** one (`GET /api/shared/:token` — the page is server-rendered, so
  IP-keyed throttling would bucket every viewer of a link together and start
  429ing readers exactly when a link takes off; the token is 32 CSPRNG bytes, so
  there is nothing to enumerate). Web: the public page sits **outside the `(app)`
  route group** (no AuthGate, no app providers) and loads its own **lazy i18n
  tier** (`stages` + `share` only — a cold visitor shouldn't download the admin
  console's copy). i18n EN + AR. Covered by 9 API unit tests (idempotent mint,
  revoke kills the token for good, the payload carries no session id/owner, a
  regressed design 404s rather than 409s).

### 🔧 Fix — the API's ESLint was never configured
- `npm run lint --workspace @archivato/api` had **no config file and no eslint
  dependency** (it resolved a hoisted binary and then died), so the lint step the
  new CI workflow runs would have failed on the first push. Added `.eslintrc.js`
  (the non-type-checked preset — `nest build` already type-checks in the same job)
  and declared the deps, then fixed the 9 findings across the existing codebase
  (unused imports/vars, two `any`s in a test fake). `no-irregular-whitespace` is
  configured to skip regexes: the Arabic-script detector spells its Unicode blocks
  as literal characters and the presentation-forms range legitimately ends at
  U+FEFF.

### ⏳ Upcoming
- A dedicated worker process + BullMQ retries/backoff.
- Broaden web test coverage (more components).