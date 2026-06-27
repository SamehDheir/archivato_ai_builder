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
| Database     | PostgreSQL + Prisma *(upcoming slice)*             |
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
│  │  └─ src/
│  │     ├─ llm/         # LlmProvider interface, mock + claude, agents
│  │     ├─ interview/   # phased interview engine (state machine, REST)
│  │     └─ requirements/# Requirement Document generation (REST)
│  └─ web/               # Next.js frontend (interview + requirements UI)
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
cp .env.example .env                       # API config
cp apps/web/.env.local.example apps/web/.env.local
```
By default the API runs in **mock LLM mode** (`LLM_PROVIDER=mock`) — fully
offline, no API key required. To use real Claude:
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6   # claude-opus-4-8 is more capable
```

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

### ⏳ Upcoming
- **Slice 4** — System Design (architecture type, tech stack, service breakdown)
  via the System Architect agent + frontend view.
- Persistence (Prisma + PostgreSQL), DB/API Design, Review Engine,
  Export (PDF/Markdown/JSON/OpenAPI/GitHub), Auth (JWT), BullMQ/Redis.

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

---

## Notes
- Sessions are stored **in memory**; restarting the API clears them. Persistence
  arrives in a dedicated slice.
- See [`CLAUDE.md`](./CLAUDE.md) for the running log of decisions and phase status.
