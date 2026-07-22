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
Idea → AI Interview → Business Analysis → Requirements → System Design →
Database Design →
API Design → AI Review → Roadmap · Cost · Threat Model · QA Plan →
Proposal message · Export / Scaffold
```

---

## Table of Contents

- [What it does](#what-it-does)
- [Feature matrix (Starter vs Team)](#feature-matrix-starter-vs-team)
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
| **Requirement Document** | A client-facing scoping artifact: plain-language executive summary, user-outcome functional requirements, roles, out-of-scope (scope-creep guard), assumptions & open questions — plus the technical non-functional requirements, business rules, and constraints. Low-stakes defaults you can proceed on are kept apart from decisions only the client can settle (which platform, which region, which compliance regime); the latter are badged **"Needs your decision"** rather than quietly resolved into an assumption |
| **Business Analysis** | The discovery pass that runs *before* requirements: the problem and who has it, user segments, competitive landscape, USP, a market read, and whether the MVP is the right cut. Outside-knowledge claims (competitors, market) carry a confidence and a research checklist — the tool has no web access and never presents recollection as fact. Owner-only; never shown to your client |
| **Product Vision** | PM-style vision derived from the interview |
| **System Design** | Constraint-aware architecture + tech stack + service modules (with build-effort complexity), a build-vs-buy plan, a phased MVP→growth path when scale outruns the budget/timeline, and a constraint-compliance table — with per-decision "Explain this" rationale. Every design opens with a **scale tier** (Small/MVP · Medium · Large/Enterprise) derived in code from the client's own stated figures, budget and timeline, and printed with the evidence it was decided from — so a 400-user internal tool is not quoted a cache, a job queue and a multi-provider hosting setup it will never use, and a 60,000-patient platform still gets them. **The same tier is handed to the roadmap, QA plan, threat model and review**, so one project gets one answer about its size: the small MVP's launch plan sets up host logs and a health check rather than Prometheus and an ELK stack, and the review stops marking a right-sized design down for the simplicity it was told to choose |
| **Database Design** | Entities, columns, keys, relationships + ER diagram (Mermaid, exportable to Draw.io/SVG/PNG/PDF) |
| **API Design** | REST endpoints per module with schemas, guaranteed to cover every database entity (or say why not) + interactive API docs and a working mock server |
| **AI Architect Review** | Scored review across security / scalability / performance / cost with findings — plus an owner-only **client-readiness** axis that hunts deal risks (ambiguous scope, promises with no backing requirement), each with a suggested resolution, and **cross-artifact consistency** checks that catch the requirements, design, effort, and cost contradicting each other |
| **Fix the findings** | Each finding is actionable, not just prose: **Propose fix** drafts a targeted rewrite of the exact document section it names, shown as a readable **before/after** you must explicitly approve — nothing is ever changed silently, and there is no "fix all". Findings only the client can settle convert to a **question to forward** or an **out-of-scope line**; the rest you acknowledge or dismiss with a note. Every applied fix is recorded in an append-only **fix history**, and re-running the review shows the score delta (`60 → 78`) |
| **Roadmap** | Phased implementation plan — each phase lists the modules it builds and carries a **person-week range computed from the effort estimate** (never guessed by the LLM), Phase 1 is flagged as the **MVP** with a "what's launchable" statement, and a stated deadline that can't fit the scope produces a **dual roadmap** (within-deadline vs full-scope). The hardening/launch work is sized to the project's scale tier, so a five-figure MVP is not scheduled to stand up an observability platform it has no one to run |
| **Project Economics** | Deterministic monthly hosting bill across 8 providers (100 / 1k / 10k users), plus a person-week **effort estimate**, third-party **service subscriptions**, an owner-only **budget reality check**, and an owner-only suggested price from your weekly rate |
| **Threat Model** | STRIDE security analysis with severities + mitigations — **opt-in per project**: small stated budgets default it off, and you can switch it on at any time |
| **QA Plan** | Test strategy + concrete test cases by type — **opt-in per project**, alongside the threat model |
| **Proposal message** | The covering message you actually submit with the bid — written from the scoping itself (what you understood, what's in scope, the effort range, the link), sized to the channel (**Upwork / Mostaql / email**), in **English or Arabic**. It never claims experience, a team size, or a portfolio, and it states a price only if you give it one — verbatim. Editable before you send, with your last 5 drafts kept |
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
OAuth), **billing** (Starter/Team via Paddle or an offline mock), a **customer
support center** with a three-layer AI assistant + knowledge base, **RBAC** for
staff consoles, **admin analytics**, and a bilingual UI (**English + Arabic,
RTL-safe**).

## Feature matrix (Starter vs Team)

| | Starter (free) | Team ($79/mo or $758/yr) |
| --- | --- | --- |
| Client scopings | 1 per month | Unlimited |
| Interview → Business Analysis → Requirements → System → Database design | ✅ | ✅ |
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
  "narration" console that streams a human-readable account of each artifact —
  on all ten AI stages, not just the design chain, so nothing runs behind a
  silent disabled button.
- **LLM usage metering:** every model call is recorded (tokens, latency, and a
  deterministic cost from a per-model price catalog) and attributed to the user,
  session, pipeline stage, and agent that caused it — surfaced as an AI-spend
  panel in `/admin`, plus a lifetime **AI cost** column in the admin users table
  (what each user costs us, next to what they pay us). Only counts are stored,
  never prompt or completion content; a model with no catalog price records tokens
  with an *unknown* cost rather than a misleading $0.
- **Activation funnel:** signup → interview → artifact → **client link sent** →
  **client opened it** → export, with the activation rate ("sent a client link
  within 7 days of signing up") on `/admin`. Each step is resolved from the
  append-only analytics event *and* from current state, so the funnel is accurate
  for accounts that predate the instrumentation and survives a project being
  deleted. A share view is attributed to the link's **owner** and records nothing
  about the reader. Owners see the customer-facing half of the same data — *"client
  opened it 2 hours ago"* on the project and dashboard cards.
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
| `GROQ_API_KEY` | One free key flips the **entire pipeline** to real AI (leave `LLM_PROVIDER` unset). The only permanently-free provider: no card, no credits |
| `GROQ_MODEL` | A **quota** decision — the free tokens/day cap is per model. `openai/gpt-oss-120b` (default) 200K/day · `llama-3.1-8b-instant` 500K · `llama-3.3-70b-versatile` 100K |
| `LLM_PROVIDER` | Force `mock` · `claude` · `groq` · `azure` · `siliconflow` · `cerebras` for all agents |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Claude provider (`claude-sonnet-4-6` default) |
| `AZURE_OPENAI_API_KEY` / `_ENDPOINT` / `_DEPLOYMENT` | Azure OpenAI provider (deployment-name routing) |
| `SILICONFLOW_API_KEY` / `SILICONFLOW_MODEL` | SiliconFlow provider (`deepseek-ai/DeepSeek-R1` default — a reasoning model) |
| `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` | Cerebras provider (`gpt-oss-120b` default). **Paid — a new account 402s on the first call**; the no-card tier is legacy and ends 17 Aug 2026 |
| `LLM_TIMEOUT_MS` / `LLM_MAX_ATTEMPTS` | Per-**attempt** timeout (default 90s) and total attempts (default 3). Applies to every provider; only transient failures (408/429/5xx, timeouts, network) are retried |
| `BILLING_PROVIDER` / `PADDLE_*` | Paddle checkout + HMAC-verified webhook; offline mock otherwise |
| `MAIL_PROVIDER` / `RESEND_API_KEY` / `SMTP_*` | Transactional email; logs to console otherwise |
| `DATABASE_URL` / `DIRECT_URL` / `REDIS_URL` | Postgres (pooled + direct for migrations) and Redis (`rediss://` supported) |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | Seeds a ready-to-log-in super-admin on boot |
| `JWT_ACCESS_SECRET` | Required ≥ 32 chars in production (boot refuses insecure configs) |

The API logs the resolved providers on startup
(`Agent LLM provider: …`, `Billing provider: …`, `Mail provider: …`).

**Every agent has a deterministic fallback**, so a missing key or a failed model
call still yields a valid artifact rather than an error. Because that makes
degradation invisible, each generated artifact records **how it was produced**
(`generation`: mode, provider, model, and why it degraded). Anything not written
by a model — including everything produced in mock mode — is flagged in the UI
with a one-click regenerate, so a template is never mistaken for AI output. The
stamp is owner-only and is stripped from the public share page.

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
- **Untrusted input, screened output:** the idea, interview answers and pasted
  call notes are text the owner did not write, and the generated document is
  rendered on a public share page. So client text is **fenced** in every prompt
  under a standing instruction applied by one chokepoint (`BaseAgent`), and the
  two artifacts that reach a third party — the requirement document and the
  proposal message — are screened on the way out so no injected link can ride
  along. Pure helpers in `@archivato/shared/prompt-safety.ts`.
- **i18n by default:** all UI chrome is English + Arabic, and the **layout
  mirrors** in Arabic rather than merely translating — direction is derived from
  the locale's writing direction (`rtlLocales`, one list) and applied at three
  seams that must agree: `<html dir>`, logical CSS throughout, and Radix's
  `DirectionProvider` (Radix reads direction from React context, not the DOM, so
  without it every `Tabs`/`Select` stamps `dir="ltr"` on itself and silently
  overrides the page). Adding another RTL locale is a one-line change.
  **Generated documents are written in the project's own language**
  — detected from how the client described the business, changeable at the
  confirmation gate. One rule, applied everywhere: chrome follows the viewer's
  locale, generated prose follows the *document's* language (produced in it on the
  first pass, never translated afterwards), and code-facing identifiers — table
  names, API paths, enum values — stay English in both. Enforced rather than
  documented: `npm run lint --workspace @archivato/web` fails on a translation key
  missing from any locale, a `t('…')` that resolves nowhere, or colloquial Arabic
  where Modern Standard is required.
- **Design tokens only:** every colour, type step, radius, shadow and duration is
  a CSS variable in `apps/web/app/globals.css`. Raw hex and Tailwind's stock
  palette are **blocked by ESLint** in components — colour has to mean a semantic
  state or a data category, never decoration. `/design` (dev-only) renders every
  token and component variant so new work has something to converge on.
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
