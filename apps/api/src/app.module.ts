import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from './llm/llm.module';
import { InterviewModule } from './interview/interview.module';

@Module({
  imports: [
    // Load .env once, globally, so every module can read config.
    ConfigModule.forRoot({ isGlobal: true }),
    // Slice 1: the LLM / Agent core.
    LlmModule,
    // Slice 2: the AI interview loop (intent → phased Q&A → confirmation gate).
    InterviewModule,
  ],
})
export class AppModule {}
