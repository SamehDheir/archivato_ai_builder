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
- **Slice 9b forgot-password — DONE (2026-06-29):** email OTP reset.
  - `apps/api/src/auth/password-reset.service.ts`: `request(email)` emails a
    uniform 6-digit OTP (only SHA-256 hash stored; 10-min expiry, single active
    per user, max 5 attempts); `reset(email, code, newPassword)` verifies the
    code, sets the new bcrypt hash, marks email verified, **revokes all refresh
    tokens**. Generic error + always-200 request = no email enumeration. New repo
    `PASSWORD_RESET_TOKEN_REPOSITORY` (in-memory + Prisma); `MailService.
    sendPasswordResetOtp`. Prisma `password_reset_tokens`; migration
    `add_password_reset_tokens` (applied). REST: POST `/auth/forgot-password`,
    POST `/auth/reset-password`.
  - Frontend: `ForgotPasswordForm` (request code → enter code + new password)
    reached via a "Forgot password?" link in `AuthForm` login mode; success
    notice on return to login.
  - Verified: 81/81 tests (7 new); live smoke (register → forgot 200 + OTP
    logged → reset 200 → old login 401 → new login 200 → code reuse 400).
- **Review fixes (2026-06-29):** (1) interview adaptive→plan fallback now picks
  the plan question BY POSITION (`QUESTION_PLAN[history.length]`) instead of the
  first unanswered id, so a transient Groq failure mid-interview continues
  forward instead of restarting at `a1`; coverage is non-decreasing. (2)
  `ChatPanel` rolls back the optimistic user bubble (and restores the input
  text) if a refine call fails.
  - **Resume across refresh:** `apps/web/app/page.tsx` saves the active
    sessionId in localStorage and rehydrates the interview + all artifacts on
    load (backend already persists everything).
- **Slice 9c OAuth — DONE (2026-06-29):** Google + GitHub sign-in.
  - `apps/api/src/auth/oauth.service.ts`: manual authorization-code flow via
    native `fetch` (no passport/SDK dep). `buildAuthorizeUrl`, `loginWithCode`
    (exchange code → fetch profile → link/create). Links by VERIFIED email
    (attach provider to existing account; else create password-less,
    emailVerified user). Per-provider enabled only when CLIENT_ID+SECRET set.
  - `oauth.controller.ts` (`/auth/oauth`): GET `providers`, `:provider/start`
    (CSRF `state` cookie → redirect to provider), `:provider/callback` (verify
    state → login → `AuthService.createSessionFor` → set cookies → redirect to
    WEB_ORIGIN; failures → `WEB_ORIGIN/login?error=…`). New public method
    `AuthService.createSessionFor(user)`.
  - Env: `GOOGLE_/GITHUB_CLIENT_ID/SECRET`, `API_ORIGIN` (callback base).
    Callbacks: `http://localhost:3001/api/auth/oauth/{google,github}/callback`.
  - Frontend: "Continue with Google/GitHub" buttons in `AuthForm` (shown via
    `GET /auth/oauth/providers`); `?error=` surfaced on `/login`.
  - Verified: 86/86 tests (5 new, fetch mocked); build clean; smoke (providers
    false/false, disabled start → 302 error, unknown provider → 400). Full
    round-trip needs real OAuth app credentials (user to create the apps).
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
- **Not built yet:** (historical note — these are now DONE) ~~Slice 9b
  forgot-password~~, ~~Slice 9c OAuth~~, ~~BullMQ/Redis~~, ~~user-scoped pipeline
  routes~~. Remaining ideas: BullMQ retries/backoff + a real worker process
  (currently in-process), YAML OpenAPI export, incremental polish.
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

- **Slice 11 — DONE (2026-06-29): Per-user pipeline ownership + async generation + UI to Tailwind/shadcn.**
  - **Pending migration applied:** `20260629090000_add_interview_adaptive_fields`
    was already applied (CLAUDE's "not applied" note was stale — `pendingQuestion`
    + `coverage` columns exist; verified via `prisma migrate status` + `\d`).
  - **User-scoped pipeline (ownership):** `InterviewSession` now has a nullable
    `userId` FK→users (cascade) + index; migration `20260629120344_add_session_
    ownership`. `start(input, userId)` stamps the owner from `@CurrentUser()`;
    new `list(userId)` → `ProjectSummary[]` (shared type). New
    `SessionOwnerGuard` (in `interview/`, **provided+exported by InterviewModule**
    so every downstream module that imports it can inject it): loads the session
    by `:sessionId`/`:id` and **404s** (no existence leak) when missing or not
    owned. ALL pipeline controllers now `@UseGuards(JwtAuthGuard,
    SessionOwnerGuard)` (interview/requirements/system-design/database-design/
    api-design/review/export/chat) — they were previously PUBLIC. Repo gained
    `findByUserId` (in-memory + Prisma). REST: GET `/interview` (my projects).
    Frontend: "My projects" list on the home screen (open any past session),
    `interviewApi.list()`, `loadSession()` refactor. Verified live: owner 200,
    attacker 404, anon 401, lists correctly scoped.
  - **BullMQ/Redis async generation:** `@nestjs/bullmq` + `bullmq`; Redis added to
    docker-compose (`redis:7-alpine`, host 6379). `jobs/` module: `PIPELINE_QUEUE`,
    `PipelineProcessor` (WorkerHost — injects the 5 stage services, runs
    `generate()` by stage), `JobsService` (enqueue with stage allowlist →400;
    `status()` cross-checks `job.data.sessionId===sessionId` so a guessable
    sequential jobId can't be read cross-tenant), `JobsController`
    (`POST/GET /jobs/:sessionId/:stage|:jobId`, owner-guarded). Shared `jobs.ts`
    (`PipelineStageName`, `JobStatus`, `PIPELINE_STAGES`). Frontend: `jobsApi.run()`
    enqueues + polls; `page.tsx` generate buttons now async with a live `<Progress>`
    bar. Verified live: enqueue→active→completed (artifact returned), attacker
    job 404, unknown stage 400, artifact persisted. NOTE: the design agents stay
    on mock by default so jobs complete instantly; the queue matters with real
    Claude/Groq.
  - **Frontend fully migrated to Tailwind + shadcn/ui** (user request — "all
    project old and new"). Added `tailwind.config.ts`, `postcss.config.js`,
    `components.json`, `lib/utils.ts` (`cn`), rewrote `globals.css` as the
    `@tailwind` layers + shadcn dark-theme HSL tokens mirroring the old palette
    (bg #0f1117, accent #6d8bff, green #4ade80). Component library under
    `components/ui/`: button, card, badge, input, textarea, label, select,
    progress, tabs, table, alert, separator, skeleton. EVERY app component
    rewritten to use them (page, AuthGate, AuthForm, ForgotPasswordForm,
    ChatPanel, Download/Export, all 5 design Views, verify page). `@/*` path
    alias already existed in tsconfig. Verified: web type-check + `next build`
    clean (7 routes); dev server serves the 31KB compiled Tailwind CSS.
  - **GOTCHA (learned):** Next only wires the PostCSS/Tailwind pipeline at
    startup — a `next dev` started BEFORE the tailwind/postcss config existed
    serves NO Tailwind output (page looks unstyled though build passes). Restart
    `next dev` after adding/changing `tailwind.config.ts`/`postcss.config.js`.
  - Tests: **98 API tests pass** (12 new: ownership guard ×5, my-projects list,
    jobs service ×5, +1). Security review: no findings; the slice removes the
    prior unauthenticated-pipeline-access gap.
  - **Prereq update:** `docker compose up -d db redis` (Redis now required for
    `/jobs`). API still boots without Redis but enqueue will fail until it's up.

- **Slice 12 — DONE (2026-06-29): Project version history (snapshot / compare / restore).**
  - **Project-level snapshots:** every modification snapshots ALL artifacts
    together as the next sequential version (chosen over per-artifact history).
    Shared `versions.ts` (`ProjectSnapshot`, `ProjectVersionMeta`,
    `ProjectVersionDetail`). Prisma `project_versions` (FK→session cascade,
    `@@unique([sessionId, version])`, snapshot JSON); migration
    `20260629143026_add_project_versions`.
  - `apps/api/src/versions`: `VersionsService.snapshot()` reads all five
    artifacts and writes the next version, **deduping** when the snapshot equals
    the latest (so deterministic mock regeneration doesn't spam versions);
    `list`/`get`; `restore()` rewrites every artifact to the target snapshot
    (upsert present, **delete absent**) and records the restore as a NEW version
    (history is never destroyed). Repository pattern (in-memory + Prisma),
    `@@unique` compound key via `sessionId_version`.
  - **`deleteBySessionId` added to all 5 artifact repos** (interface + in-memory
    + Prisma `deleteMany`) — needed for an exact restore.
  - **Snapshot hooks:** `PipelineProcessor` snapshots after each async stage
    generation (`generate <stage>`); `RefinementService` snapshots after the
    chat cascade (`refine: <instruction>`). JobsModule + ChatModule import
    VersionsModule; VersionsModule imports the 5 artifact modules + Interview
    (guard). NOTE: the **synchronous** `/:stage/generate` endpoints do NOT
    snapshot — only the jobs path + refine do (that's what the UI uses).
  - REST (owner-guarded): GET `/versions/:sessionId`, GET
    `/versions/:sessionId/:version`, POST `/versions/:sessionId/:version/restore`.
  - Frontend: `apps/web/app/VersionHistory.tsx` panel in the project view —
    version list, **side-by-side JSON diff** (client-side LCS line diff,
    add/remove highlighted), one-click **Restore**. `versionsApi`; `page.tsx`
    bumps a `versionsReload` signal after every generate/refine/restore and
    `handleRestored` replaces the in-view artifacts.
  - Verified: **102 API tests** (+4 version-service); web type-check + `next
    build` clean. Live smoke through the real BullMQ/Redis path: 5 jobs → 5
    versions (correct labels, newest-first), v1 snapshot `apiDesign:null`,
    restore v1 → v6 + api-design removed (404), attacker 404, unknown version 404.
  - **Run note:** Redis is required for `/jobs` (which now also snapshots). This
    env's Docker Desktop pulls via `mirror.gcr.io` which fails DNS — Redis only
    ran because the image was cached; a fresh pull needs that mirror fixed.

- **UI refactor (2026-06-29): tabbed project view + page.tsx split.**
  - The confirmed project view was one long vertical stack (requirements →
    system → db → api → chat → review → export → versions). Replaced with shadcn
    **`Tabs`** (`apps/web/app/ProjectStages.tsx`): one stage per tab, downstream
    tabs disabled until their prerequisite artifact exists, each tab generates
    its stage + has a "Next →" link; the job progress bar sits above the tabs.
    A guard resets to the Requirements tab if a restore removes the active tab's
    artifact (so the panel never blanks).
  - **`page.tsx` split** from ~770 lines into focused components:
    `ProjectsDashboard.tsx` (the post-login hub), `InterviewPanel.tsx` (Q&A +
    confirm gate, owns the answer input), `ProjectStages.tsx` (the tabs),
    `ProgressPanel.tsx`, `SummaryView.tsx`. `page.tsx` is now a slim orchestrator
    (state + handlers). Container widened to `max-w-4xl` for the design tables.
  - Verified: web type-check + `next build` clean; dev server serves Tailwind.

- **Real AI for ALL agents — one switch (2026-06-29).** Previously only the
  interview used real AI (Groq); the design agents were pinned to mock. Now the
  base `LLM_PROVIDER` token auto-resolves just like the interview:
  `selectProviderKind(forced, groqApiKey)` in `llm.module.ts` → an explicit
  `LLM_PROVIDER=mock|claude|groq` forces that provider for **everything**; else
  GROQ_API_KEY present → **groq for every agent** (interview + requirements,
  system, database, API, review, refine, product-analyst); else mock. Empty env
  strings count as unset. `INTERVIEW_LLM_PROVIDER` still pins only the interview.
  NO agent code changed — they all already inject `LLM_PROVIDER`; only the module
  factory + a startup log (`Agent/Interview LLM provider: <name>`) + env docs.
  Every agent keeps its deterministic fallback, so bad model output still yields
  a valid artifact. Pure helpers unit-tested (`llm.module.spec.ts`); 108 tests.
  **GOTCHA:** the old `.env`/`.env.example` had `LLM_PROVIDER=mock`, which now
  FORCES mock and defeats the key — both were changed to leave it **unset** so
  pasting `GROQ_API_KEY` flips the pipeline. (`apps/api/.env` is gitignored — the
  user must paste the real key there; verify via the startup log line.)

- **Slice 13 — DONE (2026-06-29): Architecture diagrams (Mermaid, in-browser).**
  - Decision: **Mermaid** rendered client-side (best for "display on the site")
    + **deterministic** builders (no LLM — pure, like the export builders).
  - Shared `diagrams.ts`: `DiagramKind` (flowchart|sequence|class|erd|
    microservices|deployment), `Diagram` (mermaid string + optional `note`),
    `ProjectDiagrams`, `DIAGRAM_KINDS`.
  - `apps/api/src/diagrams`: `mermaid.builders.ts` — pure builders per kind
    (ERD+Class ← database design, microservices+deployment+flowchart ← system
    design, sequence ← API design). Node ids/labels sanitized for valid Mermaid.
    `DiagramsService` gathers the artifacts and returns all 6 (a missing
    prerequisite yields a `note` instead of source). Owner-guarded
    `GET /diagrams/:sessionId`. Module imports the 3 design modules + Interview
    (guard). Builders unit-tested (`mermaid.builders.spec.ts`); 115 API tests.
  - Frontend: `mermaid@11` (dynamic `import()` → code-split, ~no First-Load
    cost). `DiagramsView.tsx` renders the selected diagram to SVG
    (`mermaid.render`, theme dark, securityLevel strict), with a kind picker,
    "View source"/"Copy Mermaid", and a source fallback if a diagram won't
    parse. New **Diagrams tab** in `ProjectStages` (enabled once the system
    design exists; refetches on the `versionsReload` signal). `diagramsApi`.
  - **GOTCHA (fixed):** installing `mermaid` hoisted `@types/d3-*` /
    `@types/geojson` into the monorepo node_modules; the API's `tsc` implicitly
    loaded ALL `@types/*` and broke on `@types/d3-array` (TS1010 under TS 5.4).
    Fixed by pinning `apps/api/tsconfig.json` `"types": ["node", "jest"]`.
  - Verified live (real Groq): full pipeline → `GET /diagrams` returns 6 valid
    diagrams (erDiagram/flowchart/sequenceDiagram/classDiagram present);
    attacker 404. Web type-check + `next build` clean (mermaid code-split).

- **Inline ER diagram + Mermaid hardening (2026-06-30).** The Database Design
  tab now LEADS with a rendered ER diagram (entity boxes + relationship lines),
  not just table cards; the detailed entity/relations tables stay below it.
  - **Builders moved to `@archivato/shared`** (`packages/shared/src/
    mermaid.builders.ts`) — they're pure + type-only-import, so both the API
    (`diagrams.service.ts` now imports `buildAllDiagrams` from the shared
    package) and the web client use ONE source of truth. Deleted
    `apps/api/src/diagrams/mermaid.builders.ts`; its spec now imports from
    `@archivato/shared`. `DatabaseDesignView` calls `buildErd(design)` inline.
  - **Reusable `MermaidView`** extracted to `apps/web/app/MermaidView.tsx`
    (was a private fn in `DiagramsView`); used by both the Diagrams tab and the
    inline DB ERD.
  - **BUG #1 (real-AI ERD broke):** the builders sanitized column NAMES but
    pasted `col.type` RAW. Real models (Groq) emit SQL types with spaces/parens/
    commas (`timestamp with time zone`, `decimal(10,2)`, `varchar(255)`), and
    Mermaid's attribute grammar wants a single-token type → `Parse error`. Fixed
    with `typeName()` (collapse anything outside `[a-zA-Z0-9_]` to `_`), applied
    in `buildErd` + `buildClassDiagram`. NB the unit tests only assert STRING
    content, never that Mermaid can actually PARSE the output — added a
    regression test; validated headlessly with `mermaid.parse` v11.16.0. (Note:
    `varchar(255)` alone actually parses; SPACES in multi-word types are the
    real killer.)
  - **BUG #2 ("Syntax error" bombs on every page):** on a parse error
    `mermaid.render` INJECTS its error "bomb" SVG into `document.body` and leaves
    it there — orphans pile up (one per failed render) and survive SPA nav, so a
    bad diagram litters the whole app (even the dashboard). Fixed by validating
    with `mermaid.parse(code, { suppressErrors:true })` BEFORE `render`, so
    render only runs on valid input and never injects a bomb; a bad diagram stays
    the local "showing the source instead" fallback.
  - **GOTCHA (self-inflicted, then fixed):** my first cleanup did
    `document.getElementById(id).remove()` in a `finally` — but `mermaid.render`
    gives the returned `<svg>` THAT SAME `id`, so it deleted every diagram the
    instant it rendered ("all diagrams disappeared"). Lesson: never
    getElementById(id).remove() the render id; the parse() pre-check alone
    prevents the bomb, no body cleanup needed on success.
  - Verified: **116 API tests** (+1 type-sanitization regression); web
    type-check clean. **Run note:** the web imports the BUILT `@archivato/shared`
    — after editing shared, `npm run build --workspace @archivato/shared` AND
    restart `next dev` (next doesn't hot-reload a workspace dep's `dist`).

- **OpenAPI viewer — on-site Swagger UI (2026-06-30).** Export already served
  the generated OpenAPI 3.0 spec at `GET /export/:sessionId/openapi` (download
  only); now you can VIEW it interactively in the app.
  - `apps/web`: added `swagger-ui-react@5` (+ `@types/swagger-ui-react`).
    `SwaggerUiClient.tsx` is a thin client wrapper that imports the library AND
    its CSS (`swagger-ui-react/swagger-ui.css`); `OpenApiView.tsx` fetches the
    spec via `exportApi.openapi(sessionId)` (already credentialed — no second
    unauthenticated request) and renders it. Swagger UI is **loaded via
    `next/dynamic` with `ssr:false`** (it touches `window` and ships a large
    bundle → code-split, no SSR eval, no First-Load cost). **Dark-themed** via
    `swagger-dark.css` (scoped to `.swagger-ui`, imported AFTER the base CSS in
    `SwaggerUiClient` so it wins), recolored to the app palette; container is
    `bg-card`.
  - New **"API Docs" tab** in `ProjectStages` after Export (enabled once the API
    design exists: `apidocs: !!apiDesign`); refetches on `versionsReload`.
  - No backend change (the spec endpoint already existed). swagger-ui-react is
    CJS and hoists to root `node_modules`; resolves fine in Next 14 App Router
    without `transpilePackages`. Verified: web type-check clean. NOTE: a build
    smoke (`next build`) was skipped because a `next dev` was live on :3000
    (don't clobber its `.next`); installing a new dep may need a `next dev`
    restart before the API Docs tab compiles.

- **Project Wizard — pipeline progress stepper (2026-06-30).**
  `apps/web/app/ProjectWizard.tsx`: a top-level horizontal stepper across the 7
  stages (Interview → Requirements → Architecture → Database → API → Review →
  Export). Each step is "done" when its artifact exists (Interview =
  `status==='confirmed'`; Export = ready once `apiDesign` exists, review
  optional); done steps show a check + filled circle, the first not-done step is
  the highlighted "current", connectors fill primary up to progress. Display-only
  (the `ProjectStages` tabs own navigation). Rendered in `page.tsx` at the top of
  the project view (BOTH the interview and confirmed phases), below the
  ←Projects/summary header. Pure presentational; web type-check clean.

- **Editable documents — structured editors + save (2026-06-30).** The 4
  generated artifacts (Requirements, Architecture/SystemDesign, Database, API)
  are no longer read-only; each has an **Edit** button that swaps the View for a
  structured form, then **Save**.
  - **Backend:** each service gained `save(sessionId, edited)` (gate: the
    artifact must already exist → 409 otherwise, so PUT can't bypass the pipeline
    order; sessionId/generatedAt are stamped server-side, not trusted from the
    body) calling the repo's existing `upsert`. New owner-guarded `PUT
    /:sessionId` on all 4 controllers. **DTOs** with class-validator nested
    validation (`@ValidateNested({each:true})` + `@Type`): `UpdateRequirement
    DocumentDto`, `UpdateSystemDesignDto`, `UpdateDatabaseDesignDto`,
    `UpdateApiDesignDto` (enums via `@IsIn`; the global ValidationPipe is
    `whitelist:true, transform:true`, so unknown props incl. sessionId/
    generatedAt are stripped).
  - **Frontend:** `apps/web/app/editor-kit.tsx` (shared `EditorBar`,
    `AddButton`, `RemoveButton`, `Check`, line/csv list helpers) + four editors
    (`RequirementDocumentEditor`, `SystemDesignEditor`, `DatabaseDesignEditor`,
    `ApiDesignEditor`). Each holds a draft via `useState` and edits it
    immutably with a `structuredClone`-then-mutate `patch()` helper (clean for
    the deep entities/columns + modules/endpoints/schema nesting). `lib/api.ts`
    gained `update()` on the 4 artifact clients (`PUT`). `ProjectStages` tracks
    an `editing` tab (cleared on tab change / restore / regenerate); the 4 stage
    tabs render the editor when editing, else View + an **Edit** button in
    `StageActions`. On save, `page.tsx` `handleSaved*` updates the in-view
    artifact + bumps `versionsReload`.
  - Note: editing is **client-validated lightly + server-validated by DTO**;
    a save doesn't cascade downstream (unlike chat refine) — editing the DB
    won't auto-regenerate the API. Use Regenerate or Refine for cascades.
  - Verified: **118 API tests** (+2: save gate + stamp/round-trip); api build +
    web type-check clean.

- **Presentation polish (2026-06-30).** (1) Interview **Conversation**
  ("speech") restyled as a clear chat: each turn labels the **Interviewer**
  (phase chip + Q number) and **You**, asymmetric bubbles, `whitespace-pre-wrap`
  so multi-line answers keep their formatting; the current-question form shows
  phase + "Question N". (2) **Requirement Document** page given a professional
  document layout: a title header with counts + generated date + download, a
  divider, and section headers with item-count chips (`Section` gained an
  optional `count`); non-functional + business rules now render as tables (like
  functional), roles as cards with permission badges. `Section`/`Empty` exports
  unchanged (editors/other views still import them). Web type-check clean.

- **Interactive design Canvas — React Flow (2026-06-30).** A new **Canvas** tab
  turns the static Mermaid diagram into an editable node board (Figma/Miro-style)
  for BOTH Architecture and Database, saving back via the editable-documents PUT
  endpoints.
  - `reactflow@11` (client-only, code-split via `next/dynamic` ssr:false in
    `DesignCanvas.tsx`; its CSS imported inside the canvas components).
  - `ArchitectureCanvas.tsx`: services = draggable nodes (custom `ServiceNode`
    with editable name + responsibility via `useReactFlow().setNodes`),
    dependencies = directed edges. + Add service, select+Delete, drag a handle to
    another node to add a dependency. Save serializes nodes→services (deps =
    outgoing edge targets, mapped id→name) → `systemDesignApi.update`.
  - `DatabaseCanvas.tsx`: entities = nodes (editable name + read-only column
    preview; the **full Entity is kept in node.data so columns survive the
    round-trip** — column editing stays in the form editor), relations = edges
    with a type label; **click an edge to cycle** one-to-many→one-to-one→
    many-to-many. + Add entity (seeds a uuid PK), connect to add a relation.
    Save → `databaseDesignApi.update`.
  - **Layout persistence = browser** (`lib/canvas-storage.ts`): node x/y saved to
    localStorage per `session+kind`, keyed by node NAME (the artifact has no ids;
    nodes get synthetic `svc-i`/`ent-i` ids rebuilt each load). No schema change;
    structure persists in the DB, positions on the device. Auto grid layout when
    no saved position.
  - `DesignCanvas.tsx` wraps both with an Architecture/Database toggle; wired into
    `ProjectStages` as the Canvas tab (enabled once `design` exists; DB sub-view
    shows a hint until the db design exists). Reuses the existing `onSavedDesign`/
    `onSavedDbDesign` handlers. Web type-check clean; no backend change.

- **UI/UX polish — toasts, skeletons, dashboard cards, clickable wizard
  (2026-06-30).**
  - **Toasts:** dependency-free `apps/web/app/toast.tsx` (`ToastProvider` +
    `useToast()` context + bottom-right Toaster, auto-dismiss, success/error/info
    variants), mounted in `layout.tsx` wrapping `AuthGate`. Wired into `page.tsx`
    handlers: artifact saves, async generate success/fail, refine, restore.
  - **Skeletons:** `components/ui/skeleton` now used for the loading states of
    `DiagramsView`, `OpenApiView`, and `VersionHistory` (added a `loaded` flag so
    the initial load shows skeleton rows, not the empty-state copy).
  - **Dashboard cards:** `ProjectsDashboard` project list → responsive 2-col grid
    of `ProjectCard`s (status badge w/ label map, completeness `Progress` for
    non-confirmed, updated-date, hover arrow). Whole card is the open button.
  - **Clickable Project Wizard:** the stage `tab` was lifted from `ProjectStages`
    into `page.tsx` (`stageTab`/`setStageTab`); `ProjectStages` is now
    tab-controlled (`tab` + `onTabChange` props; internal `setTab` aliases the
    setter). `ProjectWizard` takes `onNavigate?(tab)` (passed only once the
    interview is confirmed) and each step maps to a TabKey — done/current steps
    are clickable buttons that jump to that stage tab; Interview + locked steps
    are non-interactive. `TabKey` is now exported from `ProjectStages`.
  - Verified: web type-check clean. No backend change.

- **Light/dark theme toggle (2026-06-30).** The app was dark-only; now it has a
  real theme switch.
  - `apps/web/app/theme.tsx`: `ThemeProvider` (context, persists to
    `localStorage 'archivato.theme'`, defaults dark) + `useTheme()` + a
    sun/moon `ThemeToggle` button. The `dark` class on `<html>` is set
    **pre-paint by an inline script** in `layout.tsx` (no flash);
    `suppressHydrationWarning` on `<html>`. Provider order: Theme → Toast →
    AuthGate.
  - `globals.css` split into **light tokens on `:root`** + **dark tokens on
    `.dark`** (Tailwind `darkMode:'class'`). Dark values are the original
    palette; light is a clean white/slate set with a slightly darker primary so
    white button text stays readable.
  - Toggle placed in the `AuthGate` header (signed-in) and fixed top-right on the
    signed-out auth screen.
  - **Third-party dark skins made theme-aware:** `swagger-dark.css` selectors are
    now all prefixed `.dark .swagger-ui` (light mode → Swagger's default light
    theme); `MermaidView` initializes mermaid with `theme: dark|default` from
    `useTheme()` and re-renders on toggle (added `theme` to the effect deps). All
    app surfaces already use the HSL tokens, so they adapt automatically.
  - Verified: web type-check clean. No backend change.

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
