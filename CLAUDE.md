# Archivato AI Builder — Project Memory

## What We're Building

AI SaaS that transforms a business idea into complete software system design.
NOT a chatbot — it's an AI Software Architecture Generator.

## Tech Stack

- Backend: NestJS + TypeScript
- Frontend: Next.js 14 (App Router)
- Database: PostgreSQL + Prisma
- Queue: BullMQ + Redis
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Auth: JWT + Refresh Tokens
- Monorepo: apps/api + apps/web

## Architecture Pattern

Modular Monolith → split later if needed

## Core Pipeline

User Input → Interview Loop → Requirements → System Design →
DB Design → API Design → Review → Export

## Decisions Made

- **Stack confirmed:** NestJS (apps/api) + Next.js 14 (apps/web) + PostgreSQL/Prisma.
- **Monorepo via npm workspaces:** `apps/*` + `packages/*`. Added `packages/shared`
  for runtime-free domain types shared by api and web (`@archivato/shared`).
- **LLM behind an interface (`LlmProvider`):** agents depend only on the interface.
  - `MockLlmProvider` is the DEFAULT (offline, deterministic, zero-cost) so the
    whole pipeline is testable without network/API keys.
  - `ClaudeLlmProvider` (real Anthropic SDK) swaps in via `LLM_PROVIDER=claude`.
  - Provider selected at runtime in `LlmModule` from the `LLM_PROVIDER` env var.
- **Model is configurable** via `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`).
  Note: `claude-opus-4-8` is available and more capable if we want to bump it.
- **Structured output contract:** every agent uses `completeJson<T>()`, which
  strips code fences / prose and throws `LlmJsonParseError` on bad JSON.

## Workflow Rule (added Slice 2)

- **Every slice ships backend + matching frontend** so the user can click through
  and verify it works. Run locally: `npm run dev:api` (port 3001) and
  `npm run dev:web` (port 3000). `npm run build` builds shared → api → web.

## Current Phase

- **Slice 1 — DONE:** Monorepo scaffold + LLM/Agent Core.
  - `packages/shared`: `PipelineStage`, `AgentRole`, `ProjectIdeaInput`, LLM types.
  - `apps/api`: NestJS shell (`main.ts`, `AppModule`, global validation/config).
  - `apps/api/src/llm`: `LlmProvider` interface, mock + claude providers, JSON
    parser util, `BaseAgent`, `LlmModule`, sample `ProductAnalystAgent`, spec tests.
- **Slice 2 — DONE:** Intent Analysis + Interview Engine (the critical feature).
  - `packages/shared/interview.ts`: `InterviewPhase` (A–E), `InterviewState`,
    `RequirementsSummary`, `COMPLETENESS_THRESHOLD = 0.9`.
  - `apps/api/src/interview`: deterministic `QUESTION_PLAN` (11 Qs across phases),
    `InterviewService` state machine (collecting → awaiting_confirmation → confirmed),
    completeness scoring + 90% gate, summarize-before-confirm, intent via
    `ProductAnalystAgent` with deterministic fallback when the provider doesn't
    conform (so mock mode demos cleanly). Repository pattern:
    `InterviewSessionRepository` interface + `InMemoryInterviewSessionRepository`
    (Prisma swap-in later). REST: POST `/interview`, GET `/interview/:id`,
    POST `/interview/:id/answer`, POST `/interview/:id/confirm`. DTOs validated.
  - `apps/web` (Next.js 14): chat-style interview page — idea form → phased Q&A →
    live completeness bar → requirements summary → confirm. `lib/api.ts` client.
  - Verified: 15/15 API tests pass; api + web build clean; full HTTP flow checked
    (gate fires at 0.91, 400 on bad input, 409 on double-confirm).
- **Slice 3 — DONE:** Requirement Document generation.
  - `packages/shared/requirements.ts`: `RequirementDocument` (functional FR-n,
    nonFunctional NFR-n, roles, businessRules BR-n, constraints, assumptions).
  - `apps/api/src/llm/agents/requirement-engineer.agent.ts`: LLM generation with
    a deterministic fallback built from the interview (valid doc in mock mode).
  - `apps/api/src/requirements`: `RequirementsService` (gate: confirmed-only),
    `RequirementDocumentRepository` + in-memory impl, controller. Reads sessions
    from `InterviewModule` (which now EXPORTS `INTERVIEW_SESSION_REPOSITORY`).
  - REST: POST `/requirements/:sessionId/generate`, GET `/requirements/:sessionId`.
  - Frontend: "Generate Requirement Document" on the confirmed screen renders the
    full doc (`apps/web/app/RequirementDocumentView.tsx`) + regenerate.
  - Verified: 20/20 API tests; api + web build clean; HTTP flow checked
    (409 before confirm, 404 before generate, 200 after).
- **Slice 4 — DONE:** System Design generation.
  - `packages/shared/system-design.ts`: `SystemDesign` (architecture type +
    rationale, `TechChoice[]`, `ServiceModule[]` with dependencies).
  - `apps/api/src/llm/agents/system-architect.agent.ts`: LLM generation with a
    deterministic, keyword-driven fallback (infers architecture, tech stack, and
    services — Auth/Users always, Billing/Notifications/Reporting on keywords).
  - `apps/api/src/system-design`: `SystemDesignService` (gate: confirmed interview
    AND requirement doc must exist), repository + in-memory impl, controller.
    Reads session + requirement stores (RequirementsModule now EXPORTS
    `REQUIREMENT_DOCUMENT_REPOSITORY`).
  - REST: POST `/system-design/:sessionId/generate`, GET `/system-design/:sessionId`.
  - Frontend: `apps/web/app/SystemDesignView.tsx` + a "Generate System Design"
    button after the requirement doc (architecture, tech-stack table, service grid).
  - Verified: 26/26 API tests; api + web build clean; HTTP flow checked
    (409 before requirements, 404 before generate, 200 after).
- **Slice 5 — DONE:** Database Design generation.
  - `packages/shared/database-design.ts`: `DatabaseDesign` (entities with
    `EntityColumn` PK/FK/unique/type, `Relation[]` one-to-one/many).
  - `apps/api/src/llm/agents/database-designer.agent.ts`: LLM generation with a
    deterministic fallback (always `users`; profile table per role; invoices/
    notifications/reports per service; FKs → users.id; relations).
  - `apps/api/src/database-design`: `DatabaseDesignService` (gate: confirmed +
    requirement doc + system design must exist), repo + in-memory impl, controller.
    SystemDesignModule now EXPORTS `SYSTEM_DESIGN_REPOSITORY`.
  - REST: POST `/database-design/:sessionId/generate`, GET `/database-design/:sessionId`.
  - Frontend: `apps/web/app/DatabaseDesignView.tsx` + "Generate Database Design"
    button after system design (entity cards with PK/FK/unique badges, relations).
  - Verified: 31/31 API tests; api + web build clean; HTTP flow checked
    (409 before system design, 404 before generate, 200 after).
- **Slice 6 — DONE:** API Design generation.
  - `packages/shared/api-design.ts`: `ApiDesign` (modules → endpoints with method,
    request/response `SchemaField[]`, status codes).
  - `apps/api/src/llm/agents/api-designer.agent.ts`: LLM generation with a
    deterministic fallback (Auth module + CRUD per entity; server-managed fields
    excluded from write schemas).
  - `apps/api/src/api-design`: `ApiDesignService` (gate: full upstream chain incl.
    database design), repo + in-memory impl, controller. DatabaseDesignModule now
    EXPORTS `DATABASE_DESIGN_REPOSITORY`.
  - REST: POST `/api-design/:sessionId/generate`, GET `/api-design/:sessionId`.
  - Frontend: `apps/web/app/ApiDesignView.tsx` + "Generate API Design" button
    after the database design (method badges, paths, status codes, schema columns).
  - Verified: 36/36 API tests; api + web build clean; HTTP flow checked.
- **PERSISTENCE — DONE:** Prisma + PostgreSQL, all data stored.
  - `apps/api/prisma/schema.prisma`: `interview_sessions` (idea/industry/scale/
    preferredStack/status columns + intent/history/summary JSONB) + one table per
    artifact (`requirement_documents`, `system_designs`, `database_designs`,
    `api_designs`), each storing the artifact as JSONB, FK → session ON DELETE CASCADE.
  - `apps/api/src/prisma`: `PrismaService` (connect on init) + global `PrismaModule`.
  - Prisma-backed repos for all 5 stores implement the SAME repository interfaces;
    every feature module now provides the Prisma repo (in-memory classes kept for
    unit tests, which stay DB-free).
  - `docker-compose.yml`: Postgres 15 on host port **5433** (avoids local 5432).
    `.env` has `DATABASE_URL` (gitignored). Migration `init` applied.
  - Verified: 36/36 tests; api builds; full pipeline persisted and artifacts
    survive an API restart (proved data is in Postgres, not memory).
- **Slice 7 — DONE:** Review Engine (the AI architecture review).
  - `packages/shared/review.ts`: `ReviewReport` (scalabilityScore 0-100, summary,
    `ReviewFinding[]` security/performance with severity, missingFeatures[],
    recommendations[]).
  - `apps/api/src/llm/agents/reviewer.agent.ts`: LLM generation with a
    deterministic, artifact-aware fallback (pagination/cache/queue detection,
    authz/rate-limit/N+1 heuristics, scalability scoring).
  - `apps/api/src/review`: `ReviewService` (gate: full pipeline incl. API design),
    repo interface + in-memory (tests) + Prisma impl, controller. ApiDesignModule
    now EXPORTS `API_DESIGN_REPOSITORY`.
  - Prisma model `review_reports` (FK→session, cascade); migration
    `20260628120000_add_review_reports` applied + recorded.
  - REST: POST `/review/:sessionId/generate`, GET `/review/:sessionId`.
  - Frontend: `apps/web/app/ReviewView.tsx` + "Run AI Review" button after the API
    design (score ring, severity-tagged findings, recommendations, JSON download).
  - Verified: 41/41 API tests; api + web build clean; review_reports table created.
    NOTE: runtime HTTP smoke deferred — a Docker-Desktop restart broke host
    loopback (all 127.0.0.1 ports NetworkUnreachable), so API↔DB over localhost
    couldn't be exercised. `wsl --shutdown` / Docker restart restores it.
- **Slice 8 — DONE:** Export.
  - `packages/shared/export.ts`: `ExportBundle`, `ProjectStructure`, `ProjectFile`.
  - `apps/api/src/export`: pure dependency-free builders — `buildMarkdown`,
    `buildOpenApi` (`:id`→`{id}`, component schemas from entities),
    `buildProjectStructure` (module folder per service + shared/middleware/config/
    utils). `ExportService` gathers all artifacts (gate: pipeline through API
    design; review optional), controller serves json/markdown/openapi/structure.
    ReviewModule now EXPORTS `REVIEW_REPORT_REPOSITORY`.
  - PDF = client-side print (no server PDF dep). Markdown/print output HTML-escaped.
  - REST: GET `/export/:sessionId/{json,markdown,openapi,structure}`.
  - Frontend: `apps/web/app/ExportView.tsx` panel after the review (per-format
    downloads + Print/Save-as-PDF).
  - Verified OFFLINE: 47/47 API tests; api + web build clean. (Network was down —
    see below — so no runtime HTTP smoke; builders are fully unit-tested.)
- **Run prereq now:** `docker compose up -d db` then `npm run prisma:migrate
  --workspace @archivato/api` before `npm run dev:api`.
- **Not built yet:** BullMQ/Redis, JWT auth. CORS is still `origin:true`
  (tighten in auth slice).
- **ENV NOTE (2026-06-28):** Docker Desktop's WSL networking wiped the host
  127.0.0.0/8 loopback route mid-session → all localhost + DNS broke (push +
  DB blocked). Non-admin fixes (wsl --shutdown, quitting Docker, re-adding route)
  failed; needs an elevated `New-NetRoute` or a reboot. Slices 7 (`14a82cf`) and
  8 are committed locally and must be pushed once networking is restored.

## Review rule (added Slice 6)

After finishing each slice, run a **security + code review** (`/security-review`
and `/code-review`) and address findings before moving on.

## Verification gotcha (learned Slice 3–4)

Don't run a production `next build` in `apps/web` while a `next dev` server is
running — it overwrites `.next` and breaks the dev server (`Cannot find module
'./NNN.js'`, HTTP 500). After verifying with a build, `rm -rf apps/web/.next`
and restart `next dev`.

## Rules

- Build incrementally, one module at a time
- Never skip DTOs, Guards, validation
- Always use Repository pattern
- Environment variables for all secrets
- Ask before making architectural decisions
