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
- **Slice 9a — DONE:** Auth core (Register / Login / Refresh + JWT cookie guard).
  - `packages/shared/auth.ts`: `AuthUser` (public-safe, no hash), `AuthProvider`
    (`password` | `google` | `github`), `RegisterInput`, `LoginInput`.
  - Prisma `users` (email unique, nullable `passwordHash` for OAuth-only,
    `emailVerified`, `providers String[]`) + `refresh_tokens` (FK→users cascade,
    `tokenHash` unique, expiry, `revokedAt`). Migration
    `20260628141350_add_auth_users_refresh_tokens` applied.
  - `apps/api/src/auth`: repository pattern for BOTH stores (`USER_REPOSITORY`,
    `REFRESH_TOKEN_REPOSITORY`) with in-memory (tests) + Prisma impls.
    `PasswordService` (bcrypt, 12 rounds), `TokenService` (access JWT via
    `@nestjs/jwt` + opaque 256-bit refresh; only the SHA-256 hash is stored,
    rotated single-use on every refresh), `AuthService`, `AuthController`,
    `JwtStrategy` (reads access token from httpOnly cookie), `JwtAuthGuard`,
    `@CurrentUser()`. DTOs validated.
  - **Tokens = httpOnly cookies**: `archivato_access` (Path=/, 15min) +
    `archivato_refresh` (Path=/api/auth, 7d). `main.ts` adds `cookie-parser`
    and CORS is now locked to `WEB_ORIGIN` with `credentials:true`
    (was `origin:true`). Login does NOT leak which emails exist (generic 401).
  - REST: POST `/auth/{register,login,refresh,logout}`, GET `/auth/me` (guarded).
  - Frontend: `apps/web/app/AuthGate.tsx` gates the whole app (layout-level) —
    login/register form when signed out, header + Sign out when signed in;
    `authApi` in `lib/api.ts`; all requests now send `credentials:'include'`.
  - Decision: pipeline routes stay PUBLIC for now (auth is standalone this
    slice); userId ownership + route guards are a focused follow-up.
  - Verified: 56/56 API tests (9 new); api + web build clean; full HTTP flow
    smoke-tested live (register 201 + cookies, me 200/401, refresh 200 rotate,
    dup 409, bad login 401, logout 200).
- **Slice 9b — DONE (email verification half):** Verify email + resend.
  - Prisma `email_verification_tokens` (FK→users cascade, `tokenHash` unique,
    expiry, `consumedAt`); migration `20260628145025_add_email_verification_tokens`.
  - `apps/api/src/auth`: `MailService` (nodemailer; real SMTP when `SMTP_HOST`
    set, else logs the verify link to the console — dev fallback),
    `EmailVerificationService` (single-use 24h tokens, SHA-256-hashed, issued on
    register + resend; flips `users.emailVerified`). New repo
    `EMAIL_VERIFICATION_TOKEN_REPOSITORY` (in-memory + Prisma). `toAuthUser`
    extracted to `user.mapper.ts` (breaks the service↔strategy import cycle).
  - REST: POST `/auth/verify-email` (public, body `{token}`), POST
    `/auth/resend-verification` (guarded). Register now fires a verification
    email (non-blocking).
  - Frontend: `/verify` page (consumes `?token=`), `authApi.verifyEmail`/
    `resendVerification`, an "unverified" banner with Resend in `AuthGate`.
  - Auth UX: extracted reusable `AuthForm` (Login/Register tabs); dedicated
    `/login` + `/register` routes that are GUEST-ONLY (signed-in users are
    redirected to `/`); `/verify` is public; new spinner loading screen.
  - Verified: 62/62 API tests (6 new); api build + web type-check clean; live
    smoke (register 201 → link logged → verify true → reuse 400 → me true →
    resend 409).
  - **RE-ENABLED (2026-06-28):** after a brief disable, register sends the
    verification email again (accounts start unverified; banner restored).
    `MailService` now has a 3-tier delivery strategy: (1) real SMTP when
    `SMTP_HOST` set; (2) **Ethereal preview** when `MAIL_PREVIEW=true` and no
    SMTP — actually sends to a throwaway inbox and logs a clickable preview URL
    (zero-config dev); (3) else logs the link. Verified live: real send through
    Gmail SMTP ("Email sent … via SMTP"). User's `apps/api/.env` now carries
    `JWT_ACCESS_SECRET` (real, not the insecure fallback), `WEB_ORIGIN`,
    `MAIL_PREVIEW=true`, and Gmail `SMTP_*`.
  - **Forgot-password NOT done yet** (the other half of 9b).
- **Auth bugfix (2026-06-28):** guarded routes 401'd right after login because
  `JWT_ACCESS_TTL_SECONDS` from `.env` is a STRING ("900"); `jsonwebtoken`
  reads a numeric string `expiresIn` as MILLISECONDS, so tokens expired
  instantly (`exp === iat`). Fixed by coercing the TTL to a number in
  `TokenService` (+ `JwtModule`); regression test in `token.service.spec.ts`
  asserts a string "900" → 900s. ALSO added transparent refresh to the web
  client (`lib/api.ts`): a 401 triggers one `POST /auth/refresh` + retry, so
  short access tokens renew automatically via the 7-day refresh cookie. Gotcha:
  `config.get<number>()` does NOT coerce — env values are always strings.
- **Run prereq now:** `docker compose up -d db` then `npm run prisma:migrate
  --workspace @archivato/api` before `npm run dev:api`. On Windows, STOP
  `dev:api` before `prisma migrate/generate` (engine-DLL lock → EPERM).
- **Not built yet:** Slice 9b forgot-password (SMTP reset links), Slice 9c
  (OAuth Google/GitHub via passport), BullMQ/Redis. Pipeline routes not yet
  user-scoped.
- **ENV NOTE (2026-06-28):** The earlier loopback/DNS breakage is RESOLVED —
  localhost + DNS work again (npm install, DB on 5433, and live HTTP smoke all
  succeeded during Slice 9a). Slices 7–8 + 9a still need pushing to the remote.

- **Slice 10 — DONE:** AI Chat After Generation (refine the design via chat).
  - `packages/shared/chat.ts`: `ChatMessage`, `RefineRequest`, `RefineResult`
    (transcript + every regenerated artifact). New `AgentRole.Refiner`.
  - `apps/api/src/llm/agents/refinement.agent.ts`: amends the Requirement
    Document from an instruction (LLM + deterministic fallback that appends an
    FR, plus a scalability NFR whose wording trips the architecture fallback to
    microservices — so keyword cascades work in mock mode).
  - `apps/api/src/chat`: `RefinementService` (gate: confirmed + full design
    through API exists) amends requirements, then calls the existing
    System/DB/API services' `generate()` to regenerate downstream, and the
    `ReviewService` only if a review already existed. Persists a user+assistant
    turn. `ChatMessageRepository` (in-memory + Prisma). Controller: POST/GET
    `/chat/:sessionId`. The four stage modules now ALSO export their Service.
  - Prisma `chat_messages` (FK→session cascade); migration
    `20260628155155_add_chat_messages`.
  - Frontend: `apps/web/app/ChatPanel.tsx` after the API design (example chips,
    transcript, optimistic send); a refinement re-renders every artifact at once
    via `handleRefined` in `page.tsx`.
  - Verified: 71/71 API tests (6 new); api build + web type-check clean; live
    smoke (Add notifications → Notifications service + notifications table;
    "scalable to 5M users" → microservices; transcript persisted; reqs grew).

- **Adaptive interview + Groq (2026-06-29):** the interview now asks
  AI-generated, concept-aware questions instead of the fixed 11-question plan.
  - `apps/api/src/llm/groq-llm.provider.ts`: free **Groq** provider (OpenAI-
    compatible, native `fetch`, no SDK dep). Config `GROQ_API_KEY` (+ `GROQ_MODEL`,
    default `llama-3.3-70b-versatile`).
  - New token `INTERVIEW_LLM_PROVIDER` (in `llm-provider.interface.ts`) wired in
    `LlmModule`: defaults to **groq when `GROQ_API_KEY` is set**, else falls back
    to `LLM_PROVIDER`. So the free key flips ONLY the interview to real AI; the
    design agents stay on the default (mock). Override via `INTERVIEW_LLM_PROVIDER`.
  - `llm/agents/interviewer.agent.ts` (`AgentRole.Interviewer`): given the concept
    + answers so far, returns the next question (or `done`) + a `coverage` 0..1.
    No fallback in the agent — `InterviewService` reverts to the deterministic
    `QUESTION_PLAN` when the model is unavailable/non-conforming (mock & tests).
  - `InterviewService` refactor: stores a generated `pendingQuestion` + `coverage`
    on the session (new Prisma columns + entity fields); `decideNext()` tries the
    adaptive path, else the plan. Caps: min 4 / max 12 adaptive questions. Plan
    behavior is byte-for-byte preserved so existing tests pass.
  - Migration `20260629090000_add_interview_adaptive_fields` (pendingQuestion JSONB
    + coverage float) — **written but NOT yet applied** (Docker engine was down;
    run `prisma migrate deploy`/`dev` once Postgres is back on 5433).
  - Verified: 74/74 tests (3 new adaptive tests scripting the mock as Groq); api
    build clean. Runtime smoke against Groq pending the user's free key + DB up.

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
