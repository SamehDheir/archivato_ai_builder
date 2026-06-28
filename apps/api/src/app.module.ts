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
import { ExportModule } from './export/export.module';

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
    // Slice 8: Export (JSON / Markdown / OpenAPI / GitHub structure).
    ExportModule,
  ],
})
export class AppModule {}
