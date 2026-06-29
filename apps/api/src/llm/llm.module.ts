import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERVIEW_LLM_PROVIDER,
  LLM_PROVIDER,
  type LlmProvider,
} from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';
import { ClaudeLlmProvider } from './claude-llm.provider';
import { GroqLlmProvider } from './groq-llm.provider';

/**
 * Build a provider by kind. Kept separate so both the default provider and the
 * interview-specific provider can reuse the same selection logic.
 */
function createProvider(kind: string, config: ConfigService): LlmProvider {
  switch (kind) {
    case 'claude':
      return new ClaudeLlmProvider(config);
    case 'groq':
      return new GroqLlmProvider(config);
    case 'mock':
      return new MockLlmProvider();
    default:
      throw new Error(
        `Unknown LLM provider "${kind}" (expected "mock", "claude", or "groq")`,
      );
  }
}

/**
 * Wires the active providers from env:
 *   - LLM_PROVIDER (default "mock") → used by every design agent.
 *   - INTERVIEW_LLM_PROVIDER → used only by the adaptive interview. Defaults to
 *     "groq" when GROQ_API_KEY is set (so configuring the free key flips the
 *     interview to real AI without touching the rest of the pipeline), else it
 *     falls back to the default LLM_PROVIDER.
 *
 * Global so any module can inject either token without re-importing.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider =>
        createProvider(config.get<string>('LLM_PROVIDER', 'mock'), config),
    },
    {
      provide: INTERVIEW_LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const fallback = config.get<string>('LLM_PROVIDER', 'mock');
        const explicit = config.get<string>('INTERVIEW_LLM_PROVIDER');
        const auto = config.get<string>('GROQ_API_KEY') ? 'groq' : fallback;
        return createProvider(explicit || auto, config);
      },
    },
  ],
  exports: [LLM_PROVIDER, INTERVIEW_LLM_PROVIDER],
})
export class LlmModule {}
