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

## Current Phase

- **Slice 1 — DONE:** Monorepo scaffold + LLM/Agent Core.
  - `packages/shared`: `PipelineStage`, `AgentRole`, `ProjectIdeaInput`, LLM types.
  - `apps/api`: NestJS shell (`main.ts`, `AppModule`, global validation/config).
  - `apps/api/src/llm`: `LlmProvider` interface, mock + claude providers, JSON
    parser util, `BaseAgent`, `LlmModule`, sample `ProductAnalystAgent`, spec tests.
- **Next up — Slice 2:** Intent Analysis + Interview Engine (the critical feature:
  phased A–E loop, completeness scoring, confirmation gate).
- **Not built yet:** Prisma/Postgres wiring, BullMQ/Redis, JWT auth, apps/web UI,
  Requirements/SystemDesign/DB/API/Review/Export modules.

## Rules

- Build incrementally, one module at a time
- Never skip DTOs, Guards, validation
- Always use Repository pattern
- Environment variables for all secrets
- Ask before making architectural decisions
