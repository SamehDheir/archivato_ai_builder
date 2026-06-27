import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from './llm/llm.module';
import { InterviewModule } from './interview/interview.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SystemDesignModule } from './system-design/system-design.module';

@Module({
  imports: [
    // Load .env once, globally, so every module can read config.
    ConfigModule.forRoot({ isGlobal: true }),
    // Slice 1: the LLM / Agent core.
    LlmModule,
    // Slice 2: the AI interview loop (intent → phased Q&A → confirmation gate).
    InterviewModule,
    // Slice 3: formal Requirement Document generation from a confirmed interview.
    RequirementsModule,
    // Slice 4: System Design (architecture, tech stack, service breakdown).
    SystemDesignModule,
  ],
})
export class AppModule {}
