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
- **All stage storage is IN-MEMORY for now** (behind repository interfaces) so the
  UI runs with zero Postgres setup. Prisma/Postgres is its own upcoming slice.
- **Next up — Slice 5:** Database Design (entities, PKs/FKs, relations) via the
  Database Designer agent + frontend view.
- **Not built yet:** Prisma/Postgres wiring, BullMQ/Redis, JWT auth,
  DB/API/Review/Export modules.

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
