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
| Queue        | BullMQ + Redis *(upcoming slice)*                  |
| AI           | Anthropic Claude via a swappable `LlmProvider`     |
| Auth         | JWT access + rotating refresh tokens (httpOnly cookies) |
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
By default the API runs in **mock LLM mode** (`LLM_PROVIDER=mock`) — fully
offline, no API key required. To use real Claude:
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6   # claude-opus-4-8 is more capable
```

### Database (PostgreSQL via Prisma)
All pipeline data is persisted. Start Postgres and apply the schema:
```bash
docker compose up -d db                    # Postgres on host port 5433
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
  Technical) driven by a deterministic question plan.
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

### ⏳ Upcoming
- BullMQ/Redis for async generation; user-scoped pipeline ("my projects").
- BullMQ/Redis for async generation; YAML OpenAPI; per-user pipeline ownership.

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
| POST   | `/api/interview`           | Start an interview from a raw idea           |
| GET    | `/api/interview/:id`       | Fetch current interview state                |
| POST   | `/api/interview/:id/answer`| Answer the current question and advance      |
| POST   | `/api/interview/:id/confirm`| Confirm the summarized requirements (gate)  |
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
| GET    | `/api/export/:sessionId/json`| Full artifact bundle (JSON)                 |
| GET    | `/api/export/:sessionId/markdown`| Markdown report                         |
| GET    | `/api/export/:sessionId/openapi`| OpenAPI 3.0 spec (JSON)                   |
| GET    | `/api/export/:sessionId/structure`| GitHub project structure manifest       |

---

## Notes
- All pipeline data is **persisted in PostgreSQL** (Prisma); artifacts survive
  API restarts. The API requires a reachable `DATABASE_URL` to boot.
- See [`CLAUDE.md`](./CLAUDE.md) for the running log of decisions and phase status.
