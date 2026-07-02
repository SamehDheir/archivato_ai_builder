import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { LlmModule } from './llm/llm.module';
import { InterviewModule } from './interview/interview.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SystemDesignModule } from './system-design/system-design.module';
import { DatabaseDesignModule } from './database-design/database-design.module';
import { ApiDesignModule } from './api-design/api-design.module';
import { ReviewModule } from './review/review.module';
import { ProductVisionModule } from './product-vision/product-vision.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { ExportModule } from './export/export.module';
import { ChatModule } from './chat/chat.module';
import { JobsModule } from './jobs/jobs.module';
import { VersionsModule } from './versions/versions.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    // Load .env once, globally, so every module can read config.
    ConfigModule.forRoot({ isGlobal: true }),
    // Persistence: PostgreSQL via Prisma (global PrismaService).
    PrismaModule,
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
  ],
})
export class AppModule {}
