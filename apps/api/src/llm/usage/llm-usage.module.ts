import { Module } from '@nestjs/common';
import { LLM_USAGE_REPOSITORY } from './llm-usage.repository';
import { PrismaLlmUsageRepository } from './prisma-llm-usage.repository';
import { LlmUsageService } from './llm-usage.service';

/**
 * LLM usage metering: one row per model call (tokens + deterministic cost).
 *
 * Imported by `LlmModule` (which wraps the active provider in the usage-tracking
 * decorator) and by `AdminModule` (which reports on it). No controller of its own
 * — the read surface is `GET /admin/llm-usage`.
 */
@Module({
  providers: [
    LlmUsageService,
    { provide: LLM_USAGE_REPOSITORY, useClass: PrismaLlmUsageRepository },
  ],
  exports: [LlmUsageService, LLM_USAGE_REPOSITORY],
})
export class LlmUsageModule {}
