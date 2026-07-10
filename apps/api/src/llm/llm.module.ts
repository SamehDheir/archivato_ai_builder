import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERVIEW_LLM_PROVIDER,
  LLM_PROVIDER,
  type LlmProvider,
} from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';
import { ClaudeLlmProvider } from './claude-llm.provider';
import { GroqLlmProvider } from './groq-llm.provider';
import { AzureOpenAiLlmProvider } from './azure-openai-llm.provider';

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
    case 'azure':
      return new AzureOpenAiLlmProvider(config);
    case 'mock':
      return new MockLlmProvider();
    default:
      throw new Error(
        `Unknown LLM provider "${kind}" (expected "mock", "claude", "groq", or "azure")`,
      );
  }
}

/**
 * Resolve the provider kind for ALL agents (design + interview unless the
 * interview is overridden). One switch:
 *   1. an explicit `LLM_PROVIDER` (mock|claude|groq|azure) forces that provider;
 *   2. otherwise, when GROQ_API_KEY is set, everything uses the free Groq;
 *   3. otherwise, when AZURE_OPENAI_API_KEY is set, everything uses Azure OpenAI;
 *   4. otherwise mock (offline, deterministic).
 * Groq keeps priority over Azure so the documented "paste a free Groq key and the
 * whole pipeline goes real-AI" behaviour is unchanged; set `LLM_PROVIDER=azure`
 * to force Azure when both keys are present.
 * Empty strings count as unset (env files often leave `KEY=` blank).
 */
export function selectProviderKind(
  forced: string | undefined,
  groqApiKey: string | undefined,
  azureApiKey?: string | undefined,
): string {
  if (forced && forced.trim()) return forced.trim();
  if (groqApiKey && groqApiKey.trim()) return 'groq';
  if (azureApiKey && azureApiKey.trim()) return 'azure';
  return 'mock';
}

/**
 * The interview can still be pinned independently via INTERVIEW_LLM_PROVIDER;
 * otherwise it follows the same one-switch resolution as every other agent.
 */
export function selectInterviewKind(
  interview: string | undefined,
  forced: string | undefined,
  groqApiKey: string | undefined,
  azureApiKey?: string | undefined,
): string {
  if (interview && interview.trim()) return interview.trim();
  return selectProviderKind(forced, groqApiKey, azureApiKey);
}

/**
 * Wires the active providers from env. Setting GROQ_API_KEY flips the WHOLE
 * pipeline (every design agent + the interview) to real AI on the free Groq;
 * AZURE_OPENAI_API_KEY does the same at a lower priority;
 * `LLM_PROVIDER=mock|claude|groq|azure` forces a specific provider for
 * everything; `INTERVIEW_LLM_PROVIDER` can still pin just the interview.
 *
 * Global so any module can inject either token without re-importing.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const kind = selectProviderKind(
          config.get<string>('LLM_PROVIDER'),
          config.get<string>('GROQ_API_KEY'),
          config.get<string>('AZURE_OPENAI_API_KEY'),
        );
        const provider = createProvider(kind, config);
        new Logger('LlmModule').log(`Agent LLM provider: ${provider.name}`);
        return provider;
      },
    },
    {
      provide: INTERVIEW_LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const kind = selectInterviewKind(
          config.get<string>('INTERVIEW_LLM_PROVIDER'),
          config.get<string>('LLM_PROVIDER'),
          config.get<string>('GROQ_API_KEY'),
          config.get<string>('AZURE_OPENAI_API_KEY'),
        );
        const provider = createProvider(kind, config);
        new Logger('LlmModule').log(`Interview LLM provider: ${provider.name}`);
        return provider;
      },
    },
  ],
  exports: [LLM_PROVIDER, INTERVIEW_LLM_PROVIDER],
})
export class LlmModule {}
