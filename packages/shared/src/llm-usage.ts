/**
 * LLM usage + cost tracking (shared between API and web). Runtime-free.
 *
 * Every real model call the platform makes is metered: which agent ran, for
 * which stage/user/session, how many tokens it burned, and what that cost. The
 * dollar figures are **deterministic** — a per-model price catalog, no LLM, no
 * provider billing API — so they are unit-testable and work offline.
 *
 * A model we have no price for is NOT silently costed at $0: `estimateLlmCostUsd`
 * returns `null`, the row stores a null cost, and the admin totals count it as an
 * *unpriced* call. A blank $0.00 next to real traffic would be worse than useless
 * in a tool whose whole job is margin protection.
 */

import type { TimePoint } from './admin';

/**
 * Token usage reported by a provider for one model call.
 *
 * `promptTokens` is the **total** prompt size — including any tokens served from
 * or written to the provider's prompt cache. (Anthropic reports the uncached
 * remainder in `input_tokens` and the cache tokens separately, so the provider
 * adapter sums them; the OpenAI-shaped providers already report the total.)
 */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from the provider's cache (billed at a discount). */
  cachedPromptTokens: number;
  /** Prompt tokens written to the provider's cache (billed at a premium). */
  cacheWritePromptTokens: number;
}

/** Frozen: it's handed out as a shared fallback, so a mutation would poison it. */
export const EMPTY_LLM_USAGE: Readonly<LlmUsage> = Object.freeze({
  promptTokens: 0,
  completionTokens: 0,
  cachedPromptTokens: 0,
  cacheWritePromptTokens: 0,
});

/** Total tokens billed for a call (prompt + completion). */
export function totalTokens(usage: LlmUsage): number {
  return usage.promptTokens + usage.completionTokens;
}

// ── Stages ────────────────────────────────────────────────────────────────────

/**
 * Which part of the product spent the tokens. Derived from the route (the first
 * path segment, or an explicit `:stage` param on the `/jobs` + `/stream` routes),
 * so a new LLM-backed module lands in `other` until it's added here.
 */
export type LlmUsageStage =
  | 'interview'
  | 'requirements'
  | 'system-design'
  | 'database-design'
  | 'api-design'
  | 'review'
  | 'product-vision'
  | 'roadmap'
  | 'threat-model'
  | 'qa-plan'
  | 'chat'
  | 'support'
  | 'other';

export const LLM_USAGE_STAGES: readonly LlmUsageStage[] = [
  'interview',
  'requirements',
  'system-design',
  'database-design',
  'api-design',
  'review',
  'product-vision',
  'roadmap',
  'threat-model',
  'qa-plan',
  'chat',
  'support',
  'other',
] as const;

const STAGE_SET = new Set<string>(LLM_USAGE_STAGES);

/** Map a route segment (or stored string) onto a known stage; `other` otherwise. */
export function normalizeUsageStage(value: string | undefined | null): LlmUsageStage {
  if (!value) return 'other';
  const key = value.trim().toLowerCase();
  return STAGE_SET.has(key) ? (key as LlmUsageStage) : 'other';
}

// ── Pricing ───────────────────────────────────────────────────────────────────

/** List price for one model, in USD per 1M tokens. */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /**
   * Multiplier on prompt tokens served from the provider's cache. Defaults to
   * Anthropic's 0.1x — the **OpenAI-family entries must override it to 0.5x**,
   * which is what Azure/OpenAI actually discount a cached input token by.
   */
  cacheReadMultiplier?: number;
  /** Multiplier on prompt tokens written to cache. Anthropic: 1.25x (5m TTL). */
  cacheWriteMultiplier?: number;
}

const DEFAULT_CACHE_READ_MULTIPLIER = 0.1;
const DEFAULT_CACHE_WRITE_MULTIPLIER = 1.25;

/** OpenAI/Azure discount a cached input token by half, not by 90%. */
const OPENAI_CACHE_READ_MULTIPLIER = 0.5;

/**
 * Per-model list prices (USD / 1M tokens).
 *
 * These are **published list prices, not a billing feed** — they drift. When a
 * provider changes prices, edit this table; an unlisted model records tokens with
 * a null cost rather than a wrong one.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // Anthropic (platform.claude.com/docs/en/pricing)
  'claude-fable-5': { inputPerMTok: 10, outputPerMTok: 50 },
  'claude-mythos-5': { inputPerMTok: 10, outputPerMTok: 50 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-7': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-6': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },

  // Groq (groq.com/pricing) — the default real-AI provider. Groq reports no
  // cached prompt tokens, so the cache multipliers never apply.
  'llama-3.3-70b-versatile': { inputPerMTok: 0.59, outputPerMTok: 0.79 },
  'llama-3.1-8b-instant': { inputPerMTok: 0.05, outputPerMTok: 0.08 },
  'openai/gpt-oss-120b': { inputPerMTok: 0.15, outputPerMTok: 0.75 },
  'openai/gpt-oss-20b': { inputPerMTok: 0.1, outputPerMTok: 0.5 },

  // Azure OpenAI (azure.microsoft.com/pricing) — keyed by MODEL, not deployment
  // name, so `AzureOpenAiLlmProvider` reports the model it resolved.
  'gpt-4o': {
    inputPerMTok: 2.5,
    outputPerMTok: 10,
    cacheReadMultiplier: OPENAI_CACHE_READ_MULTIPLIER,
  },
  'gpt-4o-mini': {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    cacheReadMultiplier: OPENAI_CACHE_READ_MULTIPLIER,
  },
  'gpt-4.1': {
    inputPerMTok: 2,
    outputPerMTok: 8,
    cacheReadMultiplier: OPENAI_CACHE_READ_MULTIPLIER,
  },
  'gpt-4.1-mini': {
    inputPerMTok: 0.4,
    outputPerMTok: 1.6,
    cacheReadMultiplier: OPENAI_CACHE_READ_MULTIPLIER,
  },
  'gpt-35-turbo': { inputPerMTok: 0.5, outputPerMTok: 1.5 },
};

/** A dated snapshot of a base model: `-20250101` or `-2025-01-01`. */
const SNAPSHOT_SUFFIX = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;

/**
 * The catalog entry for a model id, or `null` when we have no price for it.
 *
 * Matching is **exact**, with one narrow relaxation: a dated snapshot id prices
 * off its base model. It deliberately does NOT prefix-match in general — that
 * would silently price `gpt-4o-realtime-preview` (a pricier model) off `gpt-4o`,
 * and a *confidently wrong* number is worse than an honest `null`, which the
 * report surfaces as an unpriced call.
 */
export function pricingFor(model: string): ModelPricing | null {
  const key = model.trim().toLowerCase();
  if (!key) return null;

  const exact = lookup(key);
  if (exact) return exact;

  const base = key.replace(SNAPSHOT_SUFFIX, '');
  return base === key ? null : lookup(base);
}

/** Own-property lookup: a plain object literal would resolve `constructor`. */
function lookup(key: string): ModelPricing | null {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICING, key)
    ? MODEL_PRICING[key]
    : null;
}

/**
 * What one call cost, in USD — or `null` when the model isn't in the catalog
 * (callers must treat that as "unknown", never as free).
 */
export function estimateLlmCostUsd(model: string, usage: LlmUsage): number | null {
  const pricing = pricingFor(model);
  if (!pricing) return null;

  const cachedRead = Math.max(0, usage.cachedPromptTokens);
  const cacheWrite = Math.max(0, usage.cacheWritePromptTokens);
  // The cache tokens are part of the prompt total; the rest bills at full rate.
  const uncached = Math.max(0, usage.promptTokens - cachedRead - cacheWrite);

  const readMult = pricing.cacheReadMultiplier ?? DEFAULT_CACHE_READ_MULTIPLIER;
  const writeMult = pricing.cacheWriteMultiplier ?? DEFAULT_CACHE_WRITE_MULTIPLIER;

  const inputUsd =
    ((uncached + cachedRead * readMult + cacheWrite * writeMult) / 1_000_000) *
    pricing.inputPerMTok;
  const outputUsd =
    (Math.max(0, usage.completionTokens) / 1_000_000) * pricing.outputPerMTok;

  // Round to the sub-cent so summing thousands of rows stays free of float dust.
  return Math.round((inputUsd + outputUsd) * 1_000_000) / 1_000_000;
}

// ── Admin read model ──────────────────────────────────────────────────────────

/** Aggregated usage over a window. */
export interface LlmUsageTotals {
  calls: number;
  /**
   * Calls that actually consumed tokens. Excludes mock calls and calls that died
   * before the model responded — the denominator for a meaningful cost-per-call
   * (dividing by `calls` would dilute it with free calls).
   */
  billedCalls: number;
  /** Calls where the provider request threw (timeout, 4xx/5xx, parse error). */
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  /**
   * Calls on a model with no catalog price. Their tokens ARE in the totals above;
   * their cost is not — so `costUsd` is a floor while this is non-zero.
   */
  unpricedCalls: number;
}

/** One row of a usage breakdown (by stage / model / provider / user). */
export interface LlmUsageBreakdown {
  key: string;
  /** Human label when the key is an opaque id (e.g. a user's email). */
  label?: string;
  calls: number;
  totalTokens: number;
  costUsd: number;
  /**
   * Calls in this row whose model had no catalog price. Non-zero means `costUsd`
   * is a floor for this row — without it a row for an unlisted model would render
   * a confident `$0.00`, which is the one thing this design refuses to do.
   */
  unpricedCalls: number;
}

/** `GET /admin/llm-usage` — LLM spend over the last 30 days. */
export interface AdminLlmUsage {
  last30d: LlmUsageTotals;
  last7d: LlmUsageTotals;
  /** Daily spend in USD, last 30 days (zero-filled). */
  costSeries: TimePoint[];
  /** Daily total tokens, last 30 days (zero-filled). */
  tokenSeries: TimePoint[];
  byStage: LlmUsageBreakdown[];
  byModel: LlmUsageBreakdown[];
  byAgent: LlmUsageBreakdown[];
  /** Heaviest spenders — the abuse-detection view. */
  topUsers: LlmUsageBreakdown[];
}
