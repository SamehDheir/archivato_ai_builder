import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, type LlmProvider } from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';
import { ClaudeLlmProvider } from './claude-llm.provider';

/**
 * Wires the active `LlmProvider` based on the LLM_PROVIDER env var:
 *   - "mock"   → MockLlmProvider (default; offline & deterministic)
 *   - "claude" → ClaudeLlmProvider (real Anthropic API)
 *
 * Global so any pipeline module can inject @Inject(LLM_PROVIDER) without
 * re-importing this module.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const kind = config.get<string>('LLM_PROVIDER', 'mock');
        switch (kind) {
          case 'claude':
            return new ClaudeLlmProvider(config);
          case 'mock':
            return new MockLlmProvider();
          default:
            throw new Error(
              `Unknown LLM_PROVIDER "${kind}" (expected "mock" or "claude")`,
            );
        }
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
