import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    // Load .env once, globally, so every module can read config.
    ConfigModule.forRoot({ isGlobal: true }),
    // Slice 1: the LLM / Agent core. Pipeline modules are added in later slices.
    LlmModule,
  ],
})
export class AppModule {}
