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
| Auth         | JWT + refresh tokens *(upcoming slice)*            |
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
│  │     ├─ llm/         # LlmProvider interface, mock + claude, agents
│  │     ├─ interview/   # phased interview engine (state machine, REST)
│  │     ├─ requirements/# Requirement Document generation (REST)
│  │     ├─ system-design/   # System Design generation (REST)
│  │     ├─ database-design/ # Database Design generation (REST)
│  │     └─ api-design/      # API Design generation (REST)
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
cp .env.example .env                       # API config (incl. DATABASE_URL)
cp apps/web/.env.local.example apps/web/.env.local
```
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
  (`requirement_documents`, `system_designs`, `database_designs`, `api_designs`),
  each storing the artifact as JSONB and cascading on session delete.
- `docker-compose.yml` provides a local Postgres; `prisma migrate` manages the
  schema. Verified end-to-end: artifacts survive a full API restart.

### ⏳ Upcoming
- **Slice 7** — Review Engine (scalability score, security issues, missing
  features, performance risks, recommendations) via the Reviewer agent + UI.
- Export (PDF/Markdown/JSON/OpenAPI/GitHub), Auth (JWT), BullMQ/Redis.

---

## API Reference (current)

| Method | Path                       | Description                                  |
| ------ | -------------------------- | -------------------------------------------- |
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

---

## Notes
- All pipeline data is **persisted in PostgreSQL** (Prisma); artifacts survive
  API restarts. The API requires a reachable `DATABASE_URL` to boot.
- See [`CLAUDE.md`](./CLAUDE.md) for the running log of decisions and phase status.
