import { EMPTY_LLM_USAGE, type LlmUsage } from '@archivato/shared';

/**
 * The `usage` block an OpenAI-shaped chat-completions API returns. Shared by the
 * two providers that speak that shape (Groq, Azure OpenAI). Unlike Anthropic,
 * `prompt_tokens` already INCLUDES any cached tokens, which are broken out in
 * `prompt_tokens_details` — so the mapping below never double-counts them.
 */
export interface OpenAiStyleUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Map an OpenAI-shaped usage block onto our provider-neutral `LlmUsage`. */
export function readOpenAiUsage(usage: OpenAiStyleUsage | undefined): LlmUsage {
  if (!usage) return { ...EMPTY_LLM_USAGE };
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    // Neither Groq nor Azure bills a cache-write premium on the prompt.
    cacheWritePromptTokens: 0,
  };
}
