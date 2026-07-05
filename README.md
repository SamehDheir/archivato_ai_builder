# Archivato AI Builder

**An AI Software Architecture Generator** — not a chatbot. It transforms a raw
business idea into a complete software system design by acting as Product
Manager, System Architect, Business Analyst, and Software Designer.

Instead of generating output immediately, it runs a **structured AI interview**
to extract requirements, then drives a pipeline of specialized agents through
design, review, and export.

```
User Input → Intent Analysis → Interview Loop → Requirements →
System Design → DB Design → API Design → Review → Export
```

---

## Tech Stack

| Layer        | Choice                                             |
| ------------ | -------------------------------------------------- |
| Backend      | NestJS + TypeScript (`apps/api`)                   |
| Frontend     | Next.js 14 (App Router) + React (`apps/web`)       |
| Shared types | `@archivato/shared` (`packages/shared`)            |
| Database     | PostgreSQL + Prisma (all data persisted)           |
| Queue        | BullMQ + Redis (async pipeline generation)         |
| AI           | Anthropic Claude via a swappable `LlmProvider`     |
| Auth         | JWT access + rotating refresh tokens (httpOnly cookies) |
| Frontend UI  | Tailwind CSS + shadcn/ui (dark theme)              |
| Monorepo     | npm workspaces (`apps/*` + `packages/*`)           |

Architecture pattern: **Modular Monolith** (split later if needed).

---

## Repository Layout

```
archivato-ai-builder/
├─ packages/
│  └─ shared/            # framework-free domain types shared by api + web
├─ apps/
│  ├─ api/               # NestJS backend
│  │  ├─ prisma/         # Prisma schema + migrations (PostgreSQL)
│  │  └─ src/
│  │     ├─ prisma/      # PrismaService + global module
│  │     ├─ auth/        # register/login/refresh, JWT cookie guard
│  │     ├─ llm/         # LlmProvider interface, mock + claude, agents
│  │     ├─ interview/   # phased interview engine (state machine, REST)
│  │     ├─ requirements/# Requirement Document generation (REST)
│  │     ├─ system-design/   # System Design generation (REST)
│  │     ├─ database-design/ # Database Design generation (REST)
│  │     ├─ api-design/      # API Design generation (REST)
│  │     ├─ review/          # AI Review Engine (REST)
│  │     ├─ export/          # Export: JSON/Markdown/OpenAPI/structure
│  │     └─ prisma/          # PrismaService + module
│  └─ web/               # Next.js frontend (interview → requirements → designs)
├─ CLAUDE.md             # working memory / decisions log
└─ README.md            # this file
```

---

## Getting Started

### Prerequisites
- Node.js >= 20

### Install
```bash
npm install
npm run build:shared      # build the shared types package once
```

### Configure
```bash
cp .env.example apps/api/.env              # API + Prisma read apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```
> The NestJS dev server and Prisma CLI load `apps/api/.env` (that's where
> `DATABASE_URL` must live). On Windows, stop the dev API before running
> `prisma migrate`/`generate` to avoid an engine-DLL file lock (`EPERM`).
**One switch for real AI.** With no key the API runs fully offline in **mock
mode** (deterministic). Pasting a **free Groq key** flips the *entire* pipeline
— the interview **and** every design agent (requirements, system, database, API,
review, refine) — to real AI:
```env
# leave LLM_PROVIDER unset → auto: Groq when GROQ_API_KEY is set, else mock
GROQ_API_KEY=gsk_...            # free, https://console.groq.com/keys
GROQ_MODEL=llama-3.3-70b-versatile
```
To force a specific provider for everything instead, set `LLM_PROVIDER`:
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6   # claude-opus-4-8 is more capable
```
Every agent keeps a deterministic fallback, so malformed model output still
produces a valid artifact. The API logs which provider it resolved on startup
(`Agent LLM provider: …` / `Interview LLM provider: …`).

**Subscriptions (optional).** Two dimensions are metered. **(1) Project count** —
Free = 1 project, **Pro = $19/mo → 5 projects**; you're blocked from starting a
new project at the limit (delete one to free a slot, or upgrade). **(2) Pipeline
depth (freemium)** — Free generates the interview, requirements, system design,
and database design (plus Product Vision); **Pro unlocks the API design and
everything after it: AI review, roadmap, cloud cost estimator, and export.**
Wherever a free user hits
a wall — the API tab, the quota banner, or starting a project at the cap — an
**in-app upgrade modal** pops up and unlocks the UI in place on success. Billing
runs **offline in mock mode by default** — upgrade applies
instantly and **cancel is at-period-end** (you keep Pro until the period ends,
then drop to Free), all with no charge, so the whole flow is demoable with zero
setup. To
use real **Paddle** (Merchant-of-Record), set `BILLING_PROVIDER=paddle` and:
```env
PADDLE_API_KEY=...            # server API key (sandbox or live)
PADDLE_PRICE_ID=pri_...       # the $19/mo recurring price
PADDLE_CLIENT_TOKEN=...       # client-side token for Paddle.js checkout
PADDLE_WEBHOOK_SECRET=...     # verifies POST /api/billing/webhook
PADDLE_ENV=sandbox            # or production
```
Point a Paddle webhook (subscription.* events) at `POST /api/billing/webhook`
(use a tunnel like ngrok for local testing). The startup log shows the resolved
`Billing provider: …`.

### Database + Redis (PostgreSQL via Prisma, Redis for the job queue)
All pipeline data is persisted; async generation runs on Redis (BullMQ). Start
both services and apply the schema:
```bash
docker compose up -d db redis              # Postgres on 5433, Redis on 6379
npm run prisma:migrate --workspace @archivato/api   # apply migrations + generate client
```
`DATABASE_URL` (in `.env`) defaults to the docker-compose database. Point it at
any other Postgres if you prefer.

### Run (two terminals)
```bash
npm run dev:api    # NestJS  → http://localhost:3001/api
npm run dev:web    # Next.js → http://localhost:3000
```
Open <http://localhost:3000> and walk through the requirements interview.

### Test & Build
```bash
npm run test:api   # Jest unit tests
npm run build      # builds shared → api → web
```

---

## Implementation Progress

The project is built incrementally, **one slice at a time**, and each slice
ships a backend feature **and** its frontend so it can be verified by hand.

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
- REST API (`/export/:sessionId/{json,markdown,openapi,structure}`).
- **Frontend**: an Export panel after the review with one-click downloads for
  each format plus "Print / Save as PDF".

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
  registration and on demand. Three-tier delivery in `MailService`: **real SMTP**
  (nodemailer) when `SMTP_HOST` is set; an **Ethereal preview** inbox when
  `MAIL_PREVIEW=true` and no SMTP (actually sends and logs a clickable preview
  URL — zero setup); otherwise it logs the link to the server console.
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
- Set `ADMIN_EMAILS=you@example.com` in `apps/api/.env`, then sign in to unlock
  the dashboard.

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

### ⏳ Upcoming
- A dedicated worker process + BullMQ retries/backoff; YAML OpenAPI export.

---

## API Reference (current)

| Method | Path                       | Description                                  |
| ------ | -------------------------- | -------------------------------------------- |
| POST   | `/api/auth/register`       | Create an account; sets auth cookies         |
| POST   | `/api/auth/login`          | Sign in; sets auth cookies                   |
| POST   | `/api/auth/refresh`        | Rotate the refresh cookie + re-issue access  |
| POST   | `/api/auth/logout`         | Revoke the refresh token and clear cookies   |
| POST   | `/api/auth/verify-email`   | Confirm an email-verification token (public) |
| POST   | `/api/auth/resend-verification`| Re-send the verification email (guarded) |
| GET    | `/api/auth/me`             | Current user (requires a valid access cookie)|
| PATCH  | `/api/auth/profile`        | Update the signed-in user's display name     |
| POST   | `/api/auth/change-password`| Change/set password; revokes other sessions  |
| DELETE | `/api/auth/me`             | Permanently delete the account (cascades)    |
| GET    | `/api/interview`           | List the signed-in user's projects           |
| POST   | `/api/interview`           | Start an interview from a raw idea (owned)    |
| GET    | `/api/interview/:id`       | Fetch current interview state (owner only)   |
| POST   | `/api/interview/:id/answer`| Answer the current question and advance      |
| POST   | `/api/interview/:id/confirm`| Confirm the summarized requirements (gate)  |
| DELETE | `/api/interview/:id`       | Delete a project + its artifacts (owner only)|
| POST   | `/api/requirements/:sessionId/generate`| Generate the Requirement Document (confirmed only) |
| GET    | `/api/requirements/:sessionId`| Fetch a generated Requirement Document    |
| POST   | `/api/system-design/:sessionId/generate`| Generate the System Design (requirements required) |
| GET    | `/api/system-design/:sessionId`| Fetch a generated System Design          |
| POST   | `/api/database-design/:sessionId/generate`| Generate the Database Design (system design required) |
| GET    | `/api/database-design/:sessionId`| Fetch a generated Database Design       |
| POST   | `/api/api-design/:sessionId/generate`| Generate the API Design (database design required) |
| GET    | `/api/api-design/:sessionId`| Fetch a generated API Design                 |
| POST   | `/api/review/:sessionId/generate`| Run the AI Review (full pipeline required)  |
| GET    | `/api/review/:sessionId`| Fetch a generated Review report                  |
| POST   | `/api/chat/:sessionId`  | Refine the design from a chat instruction        |
| GET    | `/api/chat/:sessionId`  | Fetch the refinement conversation                |
| POST   | `/api/jobs/:sessionId/:stage` | Enqueue async generation of a stage        |
| GET    | `/api/jobs/:sessionId/:jobId` | Poll a generation job's status + result    |
| GET    | `/api/versions/:sessionId` | List a project's version history             |
| GET    | `/api/versions/:sessionId/:version` | Fetch one version's full snapshot   |
| POST   | `/api/versions/:sessionId/:version/restore` | Restore the project to a version |
| GET    | `/api/diagrams/:sessionId` | Architecture diagrams (Mermaid source per kind) |
| GET    | `/api/billing/plans`       | Public plan catalogue (Free / Pro)           |
| GET    | `/api/billing`             | Current subscription + project-quota usage   |
| POST   | `/api/billing/checkout`    | Upgrade to Pro (mock activates; Paddle checkout) |
| POST   | `/api/billing/cancel`      | Cancel Pro                                   |
| POST   | `/api/billing/webhook`     | Paddle webhook (HMAC-verified; no auth)      |
| GET    | `/api/export/:sessionId/json`| Full artifact bundle (JSON)                 |
| GET    | `/api/export/:sessionId/markdown`| Markdown report                         |
| GET    | `/api/export/:sessionId/openapi`| OpenAPI 3.0 spec (JSON)                   |
| GET    | `/api/export/:sessionId/structure`| GitHub project structure manifest       |
| POST   | `/api/analytics/track`     | Anonymous pageview beacon (no auth)          |
| GET    | `/api/admin/stats`         | Admin: KPIs + 30-day trends (admin only)     |
| GET    | `/api/admin/traffic`       | Admin: traffic detail (admin only)           |
| GET    | `/api/admin/users`         | Admin: paginated users (admin only)          |
| PATCH  | `/api/admin/users/:id/role`| Admin: promote/demote a user                 |
| DELETE | `/api/admin/users/:id`     | Admin: delete a user                         |
| GET    | `/api/support/stats`       | Customer's ticket counts by status           |
| GET    | `/api/support/kb`          | Knowledge Base articles (also used by the AI)|
| GET    | `/api/support/tickets`     | List my tickets (filter/search/paginate)     |
| POST   | `/api/support/tickets`     | Open a new support ticket                    |
| GET    | `/api/support/tickets/:id` | Ticket detail (conversation + timeline)      |
| POST   | `/api/support/tickets/:id/reply`   | Reply to a ticket                    |
| POST   | `/api/support/tickets/:id/close`   | Close my ticket                      |
| POST   | `/api/support/tickets/:id/reopen`  | Reopen a resolved/closed ticket      |
| POST   | `/api/support/tickets/:id/attachments` | Attach a file (metadata + text)  |
| POST   | `/api/support/ai/deflect`  | Pre-ticket AI deflection (KB + past tickets) |
| POST   | `/api/support/tickets/:id/ai/analyze` | In-ticket AI assistant            |
| GET    | `/api/support/admin/stats` | Admin support dashboard metrics (admin only) |
| GET    | `/api/support/admin/agents`| Assignable admins (admin only)               |
| GET    | `/api/support/admin/tickets`| All tickets, filtered (admin only)          |
| PATCH  | `/api/support/admin/tickets/:id`| Change status/priority/category/assignee|
| POST   | `/api/support/admin/tickets/:id/notes`  | Add an internal note (admin)    |
| POST   | `/api/support/admin/tickets/:id/ai/copilot` | AI Copilot (admin only)     |

---

## Notes
- All pipeline data is **persisted in PostgreSQL** (Prisma); artifacts survive
  API restarts. The API requires a reachable `DATABASE_URL` to boot.
- See [`CLAUDE.md`](./CLAUDE.md) for the running log of decisions and phase status.
