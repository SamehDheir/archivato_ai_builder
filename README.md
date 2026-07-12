# Archivato AI Builder

**AI Software Architecture Generator** — turn a business idea into a complete,
export-ready software system design. Not a chatbot: a structured AI interview
extracts the requirements, then a pipeline of specialized agents produces the
architecture, database schema, REST API, review, and a runnable code scaffold.

[![CI](https://github.com/SamehDheir/archivato_ai_builder/actions/workflows/ci.yml/badge.svg)](https://github.com/SamehDheir/archivato_ai_builder/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![NestJS](https://img.shields.io/badge/NestJS-10-e0234e?logo=nestjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2d3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-dc382d?logo=redis&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-EN%20%2B%20AR%20(RTL)-6366f1)

```
Idea → AI Interview → Requirements → System Design → Database Design →
API Design → AI Review → Roadmap · Cost · Threat Model · QA Plan → Export / Scaffold
```

---

## Table of Contents

- [What it does](#what-it-does)
- [Feature matrix (Free vs Pro)](#feature-matrix-free-vs-pro)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing & CI](#testing--ci)
- [Deployment](#deployment)
- [Engineering practices](#engineering-practices)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [License](#license)

---

## What it does

Archivato interviews you like a senior consultant (≤ 9 adaptive questions),
locks the requirements behind an explicit confirmation gate, then generates a
chain of structured artifacts — each one grounded in the previous:

| Artifact | Description |
| --- | --- |
| **Requirement Document** | Functional/non-functional requirements, roles, business rules, constraints |
| **Product Vision** | PM-style vision derived from the interview |
| **System Design** | Architecture pattern, tech stack, service modules — with per-decision "Explain this" rationale |
| **Database Design** | Entities, columns, keys, relationships + ER diagram (Mermaid, exportable to Draw.io/SVG/PNG/PDF) |
| **API Design** | REST endpoints per module with schemas + interactive API docs and a working mock server |
| **AI Architect Review** | Scored review across security / scalability / performance / cost with findings |
| **Roadmap** | Phased implementation plan |
| **Cloud Cost Estimator** | Deterministic monthly bill across 8 providers at 100 / 1k / 10k users |
| **Threat Model** | STRIDE security analysis with severities + mitigations |
| **QA Plan** | Test strategy + concrete test cases by type |
| **Diagrams & Canvas** | Architecture, ER, per-endpoint sequence flows; editable canvas |
| **Export & Scaffold** | JSON / Markdown / OpenAPI (JSON+YAML) / SQL DDL / Postman / zip — plus a **runnable NestJS + Prisma backend scaffold** (ZIP or one-click push to GitHub) |

Around the pipeline: **chat refinement** (amend requirements, downstream stages
regenerate consistently), **version history** with diff + restore, **live SSE
generation console**, **public share links** (a read-only page of a finished
design that anyone can open — no account), full **auth** (email + Google/GitHub
OAuth), **billing** (Free/Pro via Paddle or an offline mock), a **customer
support center** with a three-layer AI assistant + knowledge base, **RBAC** for
staff consoles, **admin analytics**, and a bilingual UI (**English + Arabic,
RTL-safe**).

## Feature matrix (Free vs Pro)

| | Free | Pro ($19/mo or $182/yr) |
| --- | --- | --- |
| Projects | 1 | 5 |
| Interview → Requirements → System → Database design | ✅ | ✅ |
| Product Vision | ✅ | ✅ |
| API design, AI review, roadmap, cost, threat model, QA plan | — | ✅ |
| Export formats + code scaffold + API docs/mock server | — | ✅ |
| Public share link for a finished design | — | ✅ |

Billing runs **offline in mock mode by default** (instant upgrade, no charge),
so the entire funnel is demoable with zero setup; Paddle (Merchant-of-Record)
activates with a key.

## Architecture

- **Modular monolith** (NestJS): every pipeline stage is its own module with
  its own controller, service, DTOs, and guarded routes. Stages gate on their
  upstream artifacts (409 until prerequisites exist).
- **Repository pattern everywhere:** each store has an interface, an in-memory
  implementation (unit tests run DB-free), and a Prisma implementation.
- **Provider interfaces for every external dependency** — swap by env var, no
  code changes:
  - `LlmProvider`: mock · Claude · Groq · Azure OpenAI
  - `BillingProvider`: mock · Paddle
  - `MailService`: Resend · SMTP · Ethereal preview · log
- **Deterministic fallbacks:** every AI agent produces a valid artifact even
  with no key or a failed model call — the app, tests, and CI run fully
  offline. Fallbacks are a resilience layer, not mock data.
- **Async + streaming generation:** BullMQ (Redis) job queue, plus an SSE
  "narration" console that streams a human-readable account of each artifact.
- **Three independent authorization axes:** ownership (`SessionOwnerGuard`),
  entitlement (`ProGuard` / plan), and RBAC (`PermissionGuard` over a
  code-defined permission catalog with DB-managed roles).
- **Security posture:** JWT access + rotating single-use refresh tokens in
  httpOnly cookies, global rate limiting with per-route tightening, boot-time
  env validation that refuses insecure production configs, HMAC-verified
  webhooks, global exception filter (no stack leaks), Sentry opt-in.

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | NestJS + TypeScript (`apps/api`) |
| Frontend | Next.js 14 App Router + Tailwind CSS + shadcn/ui (`apps/web`) |
| Shared domain types | `@archivato/shared` (`packages/shared`, runtime-free) |
| Database | PostgreSQL + Prisma |
| Queue | BullMQ + Redis |
| AI | Swappable `LlmProvider` (mock / Claude / Groq / Azure OpenAI) |
| Payments | Paddle (MoR) behind `BillingProvider` (offline mock default) |
| Auth | JWT + rotating refresh (httpOnly cookies), Google/GitHub OAuth |
| Testing | Jest (api, node) · Jest + Testing Library (web, jsdom) · Playwright (e2e) |
| CI | GitHub Actions (lint, unit tests, builds, e2e smoke) |
| Monorepo | npm workspaces (`apps/*` + `packages/*`) |

## Repository layout

```
archivato-ai-builder/
├─ packages/shared/       # framework-free domain types + pure builders (cost,
│                         # scaffold, SQL/YAML/Postman, diagrams, permissions…)
├─ apps/
│  ├─ api/                # NestJS backend — one module per pipeline stage +
│  │                      # auth, billing, support, admin, analytics, roles…
│  └─ web/                # Next.js frontend — landing, dashboard, admin consoles
├─ e2e/                   # Playwright full-funnel smoke test
├─ .github/workflows/     # CI (lint · unit tests · builds · e2e)
├─ docs/                  # PROGRESS.md (slice log) · API.md (route reference)
├─ CLAUDE.md              # engineering memory: conventions, decisions, gotchas
└─ DEPLOY.md              # self-hosted (Docker) + managed (Render/Vercel) guides
```

## Getting started

**Prerequisites:** Node.js ≥ 20, Docker (for Postgres + Redis).

```bash
# 1. Install & build the shared package
npm install
npm run build:shared

# 2. Configure
cp .env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# 3. Database + queue
docker compose up -d db redis                        # Postgres on 5433, Redis on 6379
npm run prisma:migrate --workspace @archivato/api

# 4. Run (two terminals)
npm run dev:api    # NestJS  → http://localhost:3001/api
npm run dev:web    # Next.js → http://localhost:3000
```

Open <http://localhost:3000> — with no API keys the whole product runs
**offline in mock mode**, deterministic end to end.

## Configuration

Everything is env-driven (see `.env.example` for the full list). The important
switches:

| Variable | Effect |
| --- | --- |
| `GROQ_API_KEY` | One free key flips the **entire pipeline** to real AI (leave `LLM_PROVIDER` unset) |
| `LLM_PROVIDER` | Force `mock` · `claude` · `groq` · `azure` for all agents |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Claude provider (`claude-sonnet-4-6` default) |
| `AZURE_OPENAI_API_KEY` / `_ENDPOINT` / `_DEPLOYMENT` | Azure OpenAI provider (deployment-name routing) |
| `BILLING_PROVIDER` / `PADDLE_*` | Paddle checkout + HMAC-verified webhook; offline mock otherwise |
| `MAIL_PROVIDER` / `RESEND_API_KEY` / `SMTP_*` | Transactional email; logs to console otherwise |
| `DATABASE_URL` / `DIRECT_URL` / `REDIS_URL` | Postgres (pooled + direct for migrations) and Redis (`rediss://` supported) |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | Seeds a ready-to-log-in super-admin on boot |
| `JWT_ACCESS_SECRET` | Required ≥ 32 chars in production (boot refuses insecure configs) |

The API logs the resolved providers on startup
(`Agent LLM provider: …`, `Billing provider: …`, `Mail provider: …`).

## Testing & CI

```bash
npm run test:api   # API unit tests (Jest, node, DB-free via in-memory repos)
npm run test:web   # Web tests (Jest + React Testing Library, jsdom)
npm run test:e2e   # Playwright full-funnel smoke (Chromium)
npm run lint:web   # ESLint (eslint-config-next); api: npm run lint -w @archivato/api
npm run build      # shared → api → web
```

The **e2e smoke** drives the real product: register → adaptive interview →
confirm → system/database design → freemium wall → **mock-checkout upgrade in
place** → API design → JSON export. It is fully offline (deterministic agents +
mock billing). Prereqs: `docker compose up -d db redis`,
`npx playwright install chromium` once, and **port 3001 free** — the runner
starts its own API pinned to the local docker DB and refuses to adopt a running
`dev:api` (whose `.env` could point at a remote database).

**CI** (`.github/workflows/ci.yml`) runs on every push/PR to `develop`/`main`:
a `checks` job (lint · unit tests · production builds) and an `e2e` job
(Postgres + Redis service containers → migrations → Playwright).

## Deployment

Two documented paths (see **[DEPLOY.md](DEPLOY.md)**):

- **Self-hosted:** multi-stage Dockerfiles for api + web,
  `docker-compose.prod.yml` (db + redis + api + web with healthchecks),
  `scripts/backup-db.sh`.
- **Managed:** Render (API, via `render.yaml` blueprint) + Vercel (web) +
  Supabase (Postgres, pooled + direct URLs) + Upstash (Redis over TLS).

Health probes: `GET /health` (liveness) and `GET /health/ready` (DB + Redis
readiness, 503 when degraded).

## Engineering practices

- **Vertical slices:** every feature ships backend + frontend together and is
  hand-verifiable; each slice ends with a security review + code review.
- **Validation & guards on every route:** class-validator DTOs, ownership
  guards that 404 (never leak existence), permission guards, throttling.
- **Shared, pure domain logic:** deterministic builders (cost estimation,
  scaffold, SQL/YAML/Postman/diagram generation) live in `@archivato/shared`
  as runtime-free, unit-tested functions.
- **i18n by default:** all UI chrome is English + Arabic with RTL-safe logical
  styling; AI artifacts stay server-side English by convention.
- **Docs as memory:** [CLAUDE.md](CLAUDE.md) records conventions, decisions,
  and hard-won gotchas; [docs/PROGRESS.md](docs/PROGRESS.md) is the slice log.

## Documentation

| Doc | Contents |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Engineering memory: architecture conventions, module map, gotchas |
| [DEPLOY.md](DEPLOY.md) | Docker + Render/Vercel/Supabase/Upstash deployment guides |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Full implementation slice log |
| [docs/API.md](docs/API.md) | REST route reference |

## Roadmap

- Public share links for completed designs
- LLM token/cost observability in the admin console
- Lifecycle email (welcome / abandoned interview / upgrade nudge)
- Frontend (Next.js) scaffold to pair with the backend scaffold
- Dedicated worker process + BullMQ retries/backoff

## License

Copyright © Sameh Dheir. All rights reserved. No license is currently granted
for reuse or redistribution; open an issue to discuss usage.
