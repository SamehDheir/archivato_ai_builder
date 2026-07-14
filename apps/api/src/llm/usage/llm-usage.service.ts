import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LLM_USAGE_STAGES,
  type AdminLlmUsage,
  type LlmUsageBreakdown,
  type LlmUsageStage,
  type LlmUsageTotals,
  type TimePoint,
} from '@archivato/shared';
import type { LlmUsageRecord } from './llm-usage.entity';
import {
  LLM_USAGE_REPOSITORY,
  type CreateLlmUsageInput,
  type LlmUsageRepository,
} from './llm-usage.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const TOP_N = 10;

/**
 * Records every model call and aggregates it for the admin console.
 *
 * `record` is **best-effort by design**: metering must never be able to fail a
 * generation the user already paid for (in tokens *and* in wall-clock). A store
 * outage costs us a row, not the artifact.
 */
@Injectable()
export class LlmUsageService {
  private readonly logger = new Logger(LlmUsageService.name);

  constructor(
    @Inject(LLM_USAGE_REPOSITORY)
    private readonly repo: LlmUsageRepository,
  ) {}

  /** Record a call. Swallows its own failures — never breaks the caller. */
  async record(input: CreateLlmUsageInput): Promise<void> {
    try {
      await this.repo.create(input);
    } catch (err) {
      this.logger.warn(`Failed to record LLM usage (${input.provider}): ${err}`);
    }
  }

  /**
   * 30-day spend report. Keyed breakdowns carry ids only; the admin read-model
   * resolves user ids to emails (it owns the user directory, this module doesn't).
   */
  async report(now: Date = new Date()): Promise<AdminLlmUsage> {
    const since30 = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const since7 = new Date(now.getTime() - 7 * DAY_MS);
    const rows = await this.repo.findSince(since30);
    const recent = rows.filter((r) => r.createdAt >= since7);

    return {
      last30d: sum(rows),
      last7d: sum(recent),
      costSeries: bucketDaily(rows, WINDOW_DAYS, now, (r) => r.costUsd ?? 0),
      tokenSeries: bucketDaily(
        rows,
        WINDOW_DAYS,
        now,
        (r) => r.promptTokens + r.completionTokens,
      ),
      byStage: orderStages(groupBy(rows, (r) => r.stage)),
      byModel: groupBy(rows, (r) => `${r.provider}/${r.model}`).slice(0, TOP_N),
      byAgent: groupBy(rows, (r) => r.agent ?? 'unknown').slice(0, TOP_N),
      topUsers: groupBy(rows, (r) => r.userId ?? '').slice(0, TOP_N),
    };
  }
}

/** Tokens a call consumed. Zero for mock calls and calls that never got a reply. */
function tokensOf(r: LlmUsageRecord): number {
  return r.promptTokens + r.completionTokens;
}

/**
 * A call we were billed for but cannot price: the model isn't in the catalog. A
 * mock call (or one that died before a response) has a null-or-zero cost too, but
 * it genuinely cost nothing — hence the token check.
 */
function isUnpriced(r: LlmUsageRecord): boolean {
  return r.costUsd === null && tokensOf(r) > 0;
}

/** Totals over a set of calls. Unpriced calls contribute tokens but no cost. */
function sum(rows: LlmUsageRecord[]): LlmUsageTotals {
  const totals: LlmUsageTotals = {
    calls: rows.length,
    billedCalls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    unpricedCalls: 0,
  };
  for (const r of rows) {
    if (!r.ok) totals.failedCalls++;
    if (tokensOf(r) > 0) totals.billedCalls++;
    if (isUnpriced(r)) totals.unpricedCalls++;
    totals.promptTokens += r.promptTokens;
    totals.completionTokens += r.completionTokens;
    totals.costUsd += r.costUsd ?? 0;
  }
  totals.totalTokens = totals.promptTokens + totals.completionTokens;
  totals.costUsd = round6(totals.costUsd);
  return totals;
}

/**
 * Group into breakdown rows, heaviest spend first (then by tokens). Each row
 * carries its own `unpricedCalls` so the UI can mark a row whose cost is a floor
 * — otherwise an unlisted model would render a confident `$0.00`.
 */
function groupBy(
  rows: LlmUsageRecord[],
  key: (r: LlmUsageRecord) => string,
): LlmUsageBreakdown[] {
  const map = new Map<string, LlmUsageBreakdown>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const entry = map.get(k) ?? {
      key: k,
      calls: 0,
      totalTokens: 0,
      costUsd: 0,
      unpricedCalls: 0,
    };
    entry.calls++;
    entry.totalTokens += tokensOf(r);
    entry.costUsd += r.costUsd ?? 0;
    if (isUnpriced(r)) entry.unpricedCalls++;
    map.set(k, entry);
  }
  return [...map.values()]
    .map((e) => ({ ...e, costUsd: round6(e.costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens);
}

/** Stage breakdown in pipeline order (not spend order) — it reads as a funnel. */
function orderStages(rows: LlmUsageBreakdown[]): LlmUsageBreakdown[] {
  const order = new Map<string, number>(
    LLM_USAGE_STAGES.map((s: LlmUsageStage, i) => [s, i]),
  );
  return [...rows].sort(
    (a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99),
  );
}

/** Bucket a numeric measure into a dense daily series (oldest → newest). */
function bucketDaily(
  rows: LlmUsageRecord[],
  days: number,
  now: Date,
  value: (r: LlmUsageRecord) => number,
): TimePoint[] {
  const series = new Map<string, number>();
  const start = startOfUtcDay(now);
  for (let i = days - 1; i >= 0; i--) {
    series.set(dayKey(new Date(start.getTime() - i * DAY_MS)), 0);
  }
  for (const r of rows) {
    const key = dayKey(r.createdAt);
    if (series.has(key)) series.set(key, (series.get(key) ?? 0) + value(r));
  }
  return [...series].map(([date, v]) => ({ date, value: round6(v) }));
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Keep summed floats free of representation dust (costs are sub-cent). */
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
