import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { LlmModule } from './llm/llm.module';
import { InterviewModule } from './interview/interview.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SystemDesignModule } from './system-design/system-design.module';
import { DatabaseDesignModule } from './database-design/database-design.module';
import { ApiDesignModule } from './api-design/api-design.module';
import { ReviewModule } from './review/review.module';
import { ProductVisionModule } from './product-vision/product-vision.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { CostEstimateModule } from './cost-estimate/cost-estimate.module';
import { ExportModule } from './export/export.module';
import { ChatModule } from './chat/chat.module';
import { JobsModule } from './jobs/jobs.module';
import { VersionsModule } from './versions/versions.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { BillingModule } from './billing/billing.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { SupportModule } from './support/support.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    // Load .env once, globally, so every module can read config. `validate`
    // fails the boot on an insecure production config (e.g. a missing/weak JWT
    // secret) — see `config/env.validation.ts`.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global rate limiting (per client IP). A generous default acts as an
    // app-wide safety net; sensitive routes tighten it via `@Throttle(...)`
    // presets in `common/throttling.ts`. Behind a proxy, set TRUST_PROXY so the
    // real client IP (not the proxy's) is the throttle key — see `main.ts`.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    // Persistence: PostgreSQL via Prisma (global PrismaService).
    PrismaModule,
    // RBAC: dynamic roles + permission catalog (seeds system roles on boot).
    RolesModule,
    // Slice 9: authentication (register/login/refresh + JWT cookie guard).
    AuthModule,
    // Slice 1: the LLM / Agent core.
    LlmModule,
    // Slice 2: the AI interview loop (intent → phased Q&A → confirmation gate).
    InterviewModule,
    // Slice 3: formal Requirement Document generation from a confirmed interview.
    RequirementsModule,
    // Slice 4: System Design (architecture, tech stack, service breakdown).
    SystemDesignModule,
    // Slice 5: Database Design (entities, PKs/FKs, relations).
    DatabaseDesignModule,
    // Slice 6: API Design (endpoints, request/response schemas, status codes).
    ApiDesignModule,
    // Slice 7: Review Engine (scalability, security, performance, recommendations).
    ReviewModule,
    // Product Manager stage: standalone Product Vision (vision/goals/MVP/roadmap).
    ProductVisionModule,
    // Roadmap Planner stage: standalone phased implementation roadmap.
    RoadmapModule,
    // Cost Estimator stage: standalone deterministic per-provider monthly cost.
    CostEstimateModule,
    // Slice 8: Export (JSON / Markdown / OpenAPI / GitHub structure).
    ExportModule,
    // Slice 10: post-generation AI chat (refine the design in natural language).
    ChatModule,
    // Async pipeline generation (BullMQ/Redis): enqueue + poll job status.
    JobsModule,
    // Slice 12: project version history (snapshot on every modification).
    VersionsModule,
    // Architecture diagrams (Mermaid, deterministic from the design artifacts).
    DiagramsModule,
    // Subscriptions + project quota (free = 1 project, pro = 5/mo via Paddle).
    BillingModule,
    // Analytics: anonymous landing pageviews (beacon) + product events.
    AnalyticsModule,
    // SuperAdmin dashboard: users/projects/subscriptions/traffic reporting.
    AdminModule,
    // Customer Support Center: ticketing + 3-layer AI Support Assistant.
    SupportModule,
    // Public marketing waitlist signup (landing page).
    WaitlistModule,
  ],
  providers: [
    // Enforce the throttler on every route (overridable per-route with
    // `@Throttle`/`@SkipThrottle`).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
