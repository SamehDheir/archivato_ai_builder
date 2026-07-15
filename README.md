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
| **Requirement Document** | A client-facing scoping artifact: plain-language executive summary, user-outcome functional requirements, roles, out-of-scope (scope-creep guard), assumptions & open questions — plus the technical non-functional requirements, business rules, and constraints |
| **Product Vision** | PM-style vision derived from the interview |
| **System Design** | Constraint-aware architecture + tech stack + service modules (with build-effort complexity), a build-vs-buy plan, a phased MVP→growth path when scale outruns the budget/timeline, and a constraint-compliance table — with per-decision "Explain this" rationale |
| **Database Design** | Entities, columns, keys, relationships + ER diagram (Mermaid, exportable to Draw.io/SVG/PNG/PDF) |
| **API Design** | REST endpoints per module with schemas + interactive API docs and a working mock server |
| **AI Architect Review** | Scored review across security / scalability / performance / cost with findings |
| **Roadmap** | Phased implementation plan |
| **Project Economics** | Deterministic monthly hosting bill across 8 providers (100 / 1k / 10k users), plus a person-week **effort estimate**, third-party **service subscriptions**, an owner-only **budget reality check**, and an owner-only suggested price from your weekly rate |
| **Threat Model** | STRIDE security analysis with severities + mitigations |
| **QA Plan** | Test strategy + concrete test cases by type |
| **Diagrams & Canvas** | Architecture, ER, per-endpoint sequence flows; editable canvas |
| **Export & Scaffold** | JSON / Markdown / OpenAPI (JSON+YAML) / SQL DDL / Postman / zip — plus a **runnable app scaffold**: a NestJS + Prisma API, a Next.js client (typed API client + CRUD pages), or both as one workspace (ZIP or one-click push to GitHub) |
| **Deployment** | Every scaffold ships a Dockerfile, `docker-compose.yml`, a GitHub Actions workflow, and the config for the provider your cost estimate says is the best value it can actually run on (Render / Fly.io / Railway / Heroku / DigitalOcean / Vercel) |

Around the pipeline: **chat refinement** (amend requirements, downstream stages
regenerate consistently — and the derived artifacts that don't, like the roadmap
or cost estimate, are **flagged stale with one-click regenerate** rather than
quietly describing a design that changed), **version history** with diff +
restore, **live SSE
generation console**, **client-facing share links** (a read-only *proposal* page
ordered for the buyer — vision → requirements → cost → roadmap, with the technical
detail collapsed below — that anyone can open with no account; free on every plan
as the organic loop, carrying a "Built with Archivato" watermark below Pro), full
**auth** (email + Google/GitHub
OAuth), **billing** (Free/Pro via Paddle or an offline mock), a **customer
support center** with a three-layer AI assistant + knowledge base, **RBAC** for
staff consoles, **admin analytics**, and a bilingual UI (**English + Arabic,
RTL-safe**).

## Feature matrix (Free vs Pro)

| | Free | Pro ($19/mo or $182/yr) |
| --- | --- | --- |
| Client scopings | 1 | 5 |
| Interview → Requirements → System → Database design | ✅ | ✅ |
| Product Vision | ✅ | ✅ |
| Client-facing share link (read-only proposal page) | ✅ with watermark | ✅ no watermark |
| API design, AI review, roadmap, cost, threat model, QA plan | — | ✅ |
| Export formats + code scaffold + API docs/mock server | — | ✅ |

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
- **LLM usage metering:** every model call is recorded (tokens, latency, and a
  deterministic cost from a per-model price catalog) and attributed to the user,
  session, pipeline stage, and agent that caused it — surfaced as an AI-spend
  panel in `/admin`, plus a lifetime **AI cost** column in the admin users table
  (what each user costs us, next to what they pay us). Only counts are stored,
  never prompt or completion content; a model with no catalog price records tokens
  with an *unknown* cost rather than a misleading $0.
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
| Testing | Jest (api, node) · Jest + Testing Library (web, jsdom) |
| CI | GitHub Actions (lint, unit tests, builds) |
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
├─ .github/workflows/     # CI (lint · unit tests · builds)
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
npm run lint:web   # ESLint (eslint-config-next); api: npm run lint -w @archivato/api
npm run build      # shared → api → web
```

Every unit test runs **offline**: the API's repositories have in-memory
implementations (no database) and the agents fall back to their deterministic
builders (no LLM key), so the whole suite is hermetic.

**CI** (`.github/workflows/ci.yml`) runs on every push/PR to `develop`/`main`:
one `checks` job — build shared → prisma generate → lint api + web → unit tests
api + web → production builds api + web.

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

- Lifecycle email (welcome / abandoned interview / upgrade nudge)
- Cascade regeneration into the standalone stages (they are flagged stale today,
  with one-click regenerate — auto-cascading would re-bill four LLM stages on
  every refine, so it needs a cost decision first)
- Dedicated worker process + BullMQ retries/backoff

## License

Copyright © Sameh Dheir. All rights reserved. No license is currently granted
for reuse or redistribution; open an issue to discuss usage.
