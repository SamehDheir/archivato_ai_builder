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
import { SiliconFlowLlmProvider } from './siliconflow-llm.provider';
import { CerebrasLlmProvider } from './cerebras-llm.provider';
import { UsageTrackingLlmProvider } from './usage-tracking-llm.provider';
import { LlmUsageModule } from './usage/llm-usage.module';
import { LlmUsageService } from './usage/llm-usage.service';

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
    case 'siliconflow':
      return new SiliconFlowLlmProvider(config);
    case 'cerebras':
      return new CerebrasLlmProvider(config);
    case 'mock':
      return new MockLlmProvider();
    default:
      throw new Error(
        `Unknown LLM provider "${kind}" (expected "mock", "claude", "groq", "azure", "siliconflow", or "cerebras")`,
      );
  }
}

/**
 * The API keys that can auto-select a provider, **in priority order**.
 *
 * A named object rather than positional arguments: with five providers the old
 * signature was four optional strings in a row, where transposing two reads
 * fine, compiles fine, and silently selects the wrong provider. The order that
 * matters now lives in `PROVIDER_PRIORITY` — one list, stated once.
 */
export interface ProviderKeys {
  groq?: string;
  azure?: string;
  siliconflow?: string;
  cerebras?: string;
}

/**
 * Auto-selection order. **Append only.**
 *
 * A new key must never silently move an existing install off the provider it has
 * been running on, so every addition goes on the END — Groq stays first so the
 * documented "paste a free Groq key and the whole pipeline goes real-AI"
 * behaviour is unchanged, and Cerebras sits last despite also being free. Force
 * one with `LLM_PROVIDER=<kind>` when several keys are present.
 */
const PROVIDER_PRIORITY: readonly (keyof ProviderKeys)[] = [
  'groq',
  'azure',
  'siliconflow',
  'cerebras',
];

/**
 * Resolve the provider kind for ALL agents (design + interview unless the
 * interview is overridden). One switch: an explicit `LLM_PROVIDER`
 * (mock|claude|groq|azure|siliconflow|cerebras) forces it; otherwise the first
 * key present in `PROVIDER_PRIORITY` wins; otherwise mock (offline,
 * deterministic).
 *
 * Empty strings count as unset (env files often leave `KEY=` blank).
 */
export function selectProviderKind(
  forced: string | undefined,
  keys: ProviderKeys = {},
): string {
  if (forced && forced.trim()) return forced.trim();
  const found = PROVIDER_PRIORITY.find((kind) => keys[kind]?.trim());
  return found ?? 'mock';
}

/** Env vars that mean a real provider is available and paid for. */
const REAL_PROVIDER_KEYS = [
  'GROQ_API_KEY',
  'ANTHROPIC_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'SILICONFLOW_API_KEY',
  'CEREBRAS_API_KEY',
] as const;

/**
 * The names of the real-provider keys that are set, when the resolved provider
 * is nonetheless `mock`. Empty when that isn't the case (nothing to warn about).
 *
 * A forced `mock` while a real key is sitting right there is almost always a
 * stale env var rather than a choice — and it is *invisible*: every agent has a
 * deterministic fallback, so the pipeline still produces artifacts (templated
 * ones), and the usage meter honestly records $0. The symptom is "the AI spend
 * report doesn't account for anything", which reads as a broken feature.
 *
 * The trap that caused it: `@prisma/client` loads the REPO-ROOT `.env` into
 * `process.env` when it is imported, and `process.env` outranks `apps/api/.env`
 * inside ConfigModule — so a stray `LLM_PROVIDER=mock` in the root file wins
 * over a perfectly good `GROQ_API_KEY` in the API's own env.
 */
export function mockOverriddenKeys(
  kind: string,
  read: (key: string) => string | undefined,
): string[] {
  if (kind !== 'mock') return [];
  return REAL_PROVIDER_KEYS.filter((key) => read(key)?.trim());
}

/**
 * The interview can still be pinned independently via INTERVIEW_LLM_PROVIDER;
 * otherwise it follows the same one-switch resolution as every other agent.
 */
export function selectInterviewKind(
  interview: string | undefined,
  forced: string | undefined,
  keys: ProviderKeys = {},
): string {
  if (interview && interview.trim()) return interview.trim();
  return selectProviderKind(forced, keys);
}

/** Read every auto-selecting provider key out of config, in one place. */
function providerKeys(config: ConfigService): ProviderKeys {
  return {
    groq: config.get<string>('GROQ_API_KEY'),
    azure: config.get<string>('AZURE_OPENAI_API_KEY'),
    siliconflow: config.get<string>('SILICONFLOW_API_KEY'),
    cerebras: config.get<string>('CEREBRAS_API_KEY'),
  };
}

/**
 * Announce the resolved provider — and shout when it is `mock` despite a real
 * key being configured, because that failure mode is otherwise silent.
 */
function announce(kind: string, name: string, label: string, config: ConfigService): void {
  const logger = new Logger('LlmModule');
  logger.log(`${label} LLM provider: ${name}`);

  const ignored = mockOverriddenKeys(kind, (key) => config.get<string>(key));
  if (ignored.length > 0) {
    logger.warn(
      `${label} is on the MOCK provider even though ${ignored.join(', ')} is set. ` +
        'Every agent will emit deterministic template output and AI spend will ' +
        'record $0. Unset LLM_PROVIDER — check the repo-root .env too: ' +
        '@prisma/client loads it into process.env, which outranks apps/api/.env.',
    );
  }
}

/**
 * Wires the active providers from env. Setting GROQ_API_KEY flips the WHOLE
 * pipeline (every design agent + the interview) to real AI on the free Groq;
 * AZURE_OPENAI_API_KEY, SILICONFLOW_API_KEY then CEREBRAS_API_KEY do the same at
 * lower priority (see `PROVIDER_PRIORITY`);
 * `LLM_PROVIDER=mock|claude|groq|azure|siliconflow|cerebras` forces a specific
 * provider for everything; `INTERVIEW_LLM_PROVIDER` can still pin just the
 * interview.
 *
 * Global so any module can inject either token without re-importing.
 */
@Global()
@Module({
  imports: [LlmUsageModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, LlmUsageService],
      useFactory: (
        config: ConfigService,
        usage: LlmUsageService,
      ): LlmProvider => {
        const kind = selectProviderKind(
          config.get<string>('LLM_PROVIDER'),
          providerKeys(config),
        );
        const provider = createProvider(kind, config);
        announce(kind, provider.name, 'Agent', config);
        // Every agent talks to the metered wrapper, never the raw provider.
        return new UsageTrackingLlmProvider(provider, usage);
      },
    },
    {
      provide: INTERVIEW_LLM_PROVIDER,
      inject: [ConfigService, LlmUsageService],
      useFactory: (
        config: ConfigService,
        usage: LlmUsageService,
      ): LlmProvider => {
        const kind = selectInterviewKind(
          config.get<string>('INTERVIEW_LLM_PROVIDER'),
          config.get<string>('LLM_PROVIDER'),
          providerKeys(config),
        );
        const provider = createProvider(kind, config);
        announce(kind, provider.name, 'Interview', config);
        return new UsageTrackingLlmProvider(provider, usage);
      },
    },
  ],
  exports: [LLM_PROVIDER, INTERVIEW_LLM_PROVIDER],
})
export class LlmModule {}
