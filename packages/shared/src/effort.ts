/**
 * Project economics — the effort estimate + budget reality check (R9).
 *
 * All pure and deterministic (no LLM, no I/O), so every number is reproducible
 * and unit-testable. The effort estimate turns the R8 module complexity +
 * build-vs-buy calls into a person-week range; the budget check compares it
 * against the client's stated budget. These are PLANNING figures, not quotes.
 */

import {
  isModuleComplexity,
  type BuildVsBuyCapability,
  type ModuleComplexity,
  type SystemDesign,
} from './system-design';

// ── Effort model (tunable constants — edit here) ────────────────────────────

export interface EffortModel {
  /** Person-week [min, max] per module complexity. */
  complexity: Record<ModuleComplexity, readonly [number, number]>;
  /** A "buy" capability's build effort collapses to this fraction (integration only). */
  buyIntegrationFactor: number;
  /** Flat integration line [min, max] weeks when a bought capability maps to no module. */
  buyIntegrationFlat: readonly [number, number];
  fixed: {
    /** Flat weeks for project setup. */
    projectSetupWeeks: number;
    /** QA & testing as a fraction of the build subtotal. */
    qaTestingPct: number;
    /** Flat weeks for deployment / DevOps. */
    deploymentDevopsWeeks: number;
    /** Contingency buffer as a fraction of the build subtotal. */
    bufferPct: number;
  };
}

/**
 * Default effort model. Documented, tunable, and the single source of the ranges
 * — change a number here and every estimate moves with it.
 */
export const EFFORT_MODEL: EffortModel = {
  complexity: {
    S: [0.5, 1],
    M: [1, 2.5],
    L: [2.5, 5],
    XL: [5, 8],
  },
  buyIntegrationFactor: 0.25,
  buyIntegrationFlat: [0.5, 1],
  fixed: {
    projectSetupWeeks: 1,
    qaTestingPct: 0.2,
    deploymentDevopsWeeks: 1,
    bufferPct: 0.15,
  },
};

/** How an effort line was derived (drives grouping in the roadmap + rendering). */
export type EffortLineKind = 'module' | 'integration' | 'fixed';

export interface EffortLineItem {
  kind: EffortLineKind;
  label: string;
  /** Human note on how the number was derived. */
  basis: string;
  weeksMin: number;
  weeksMax: number;
  /** The design module this line maps to (present for kind 'module'/'integration'). */
  module?: string;
}

export interface EffortEstimate {
  lineItems: EffortLineItem[];
  weeksMin: number;
  weeksMax: number;
}

/** Round to the nearest 0.5 (all effort figures are half-week planning numbers). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Which module names a bought capability collapses into integration-only work. */
const CAPABILITY_MODULE_PATTERNS: Record<BuildVsBuyCapability, RegExp> = {
  auth: /auth|login|identity|account/i,
  payments: /payment|billing|checkout|invoice|payout|wallet/i,
  notifications: /notif|messaging|\bemail\b|\bsms\b|alert/i,
  file_storage: /file|storage|media|upload|asset|document/i,
  maps_geo: /\bmap\b|maps|geo|location|route|track/i,
  search: /search|index|discovery/i,
};

const CAPABILITY_LABELS: Record<BuildVsBuyCapability, string> = {
  auth: 'authentication',
  payments: 'payments',
  notifications: 'notifications',
  file_storage: 'file storage',
  maps_geo: 'maps / geolocation',
  search: 'search',
};

/**
 * Deterministically estimate the build effort in person-weeks. Module lines come
 * from R8 complexity (a missing/invalid complexity defaults to M); each build-vs-buy
 * "buy" call collapses its module to integration-only work (or adds a flat line
 * when it maps to no module); fixed items (setup, QA, DevOps, buffer) are layered
 * on the build subtotal. Every figure is rounded to the nearest 0.5 week.
 */
export function buildEffortEstimate(
  design: Pick<SystemDesign, 'services' | 'buildVsBuy'>,
  options?: { model?: EffortModel },
): EffortEstimate {
  const model = options?.model ?? EFFORT_MODEL;
  const lineItems: EffortLineItem[] = [];

  // 1. Module lines from complexity.
  for (const svc of design.services) {
    const complexity: ModuleComplexity =
      svc.complexity && isModuleComplexity(svc.complexity) ? svc.complexity : 'M';
    const [min, max] = model.complexity[complexity];
    lineItems.push({
      kind: 'module',
      module: svc.name,
      label: svc.name,
      basis: `module · complexity ${complexity}`,
      weeksMin: min,
      weeksMax: max,
    });
  }

  // 2. Build-vs-buy modifiers. "buy" collapses the matching module to integration
  //    work (or adds a flat integration line); "build" keeps the full module weight.
  for (const item of design.buildVsBuy ?? []) {
    if (item.recommendation !== 'buy') continue;
    const pattern = CAPABILITY_MODULE_PATTERNS[item.capability];
    const line = lineItems.find(
      (l) => l.kind === 'module' && !!l.module && pattern.test(l.module),
    );
    if (line) {
      line.kind = 'integration';
      line.weeksMin = line.weeksMin * model.buyIntegrationFactor;
      line.weeksMax = line.weeksMax * model.buyIntegrationFactor;
      line.basis = `buy · integration only (${line.module})`;
    } else {
      const [fMin, fMax] = model.buyIntegrationFlat;
      lineItems.push({
        kind: 'integration',
        label: `Integrate ${CAPABILITY_LABELS[item.capability]}`,
        basis: 'buy · flat integration',
        weeksMin: fMin,
        weeksMax: fMax,
      });
    }
  }

  // 3. Fixed items off the build subtotal (modules + integrations).
  const buildMin = lineItems.reduce((s, l) => s + l.weeksMin, 0);
  const buildMax = lineItems.reduce((s, l) => s + l.weeksMax, 0);
  const { fixed } = model;
  lineItems.push({
    kind: 'fixed',
    label: 'Project setup',
    basis: 'flat',
    weeksMin: fixed.projectSetupWeeks,
    weeksMax: fixed.projectSetupWeeks,
  });
  lineItems.push({
    kind: 'fixed',
    label: 'QA & testing',
    basis: `${Math.round(fixed.qaTestingPct * 100)}% of build`,
    weeksMin: buildMin * fixed.qaTestingPct,
    weeksMax: buildMax * fixed.qaTestingPct,
  });
  lineItems.push({
    kind: 'fixed',
    label: 'Deployment & DevOps',
    basis: 'flat',
    weeksMin: fixed.deploymentDevopsWeeks,
    weeksMax: fixed.deploymentDevopsWeeks,
  });
  lineItems.push({
    kind: 'fixed',
    label: 'Contingency buffer',
    basis: `${Math.round(fixed.bufferPct * 100)}% of build`,
    weeksMin: buildMin * fixed.bufferPct,
    weeksMax: buildMax * fixed.bufferPct,
  });

  // 4. Round every line to 0.5; totals are the sum of the rounded lines.
  const rounded = lineItems.map((l) => ({
    ...l,
    weeksMin: roundHalf(l.weeksMin),
    weeksMax: roundHalf(l.weeksMax),
  }));
  return {
    lineItems: rounded,
    weeksMin: roundHalf(rounded.reduce((s, l) => s + l.weeksMin, 0)),
    weeksMax: roundHalf(rounded.reduce((s, l) => s + l.weeksMax, 0)),
  };
}

// ── Budget reality check (owner-only) ───────────────────────────────────────

/** A conservative generic weekly-rate band (USD per person-week). */
export interface ReferenceRates {
  /** Low end — the cheapest credible labor. Used for the "even at the floor" check. */
  lowUsd: number;
  /** High end — for display context only. */
  highUsd: number;
}

/**
 * Market-generic reference rates (USD / person-week). NOT advice and NOT tied to
 * any region — a conservative planning band; tune to your market in one place.
 */
export const REFERENCE_RATES: ReferenceRates = {
  lowUsd: 1200,
  highUsd: 3500,
};

export type BudgetSeverity = 'warning' | 'critical';

export interface BudgetWarning {
  severity: BudgetSeverity;
  /** i18n message key (the message itself is localized in the client). */
  messageKey: string;
  values: {
    /** Estimated build cost at the low reference rate (rounded to $100). */
    estimatedLowUsd: number;
    /** Top of the client's stated budget range. */
    budgetMaxUsd: number;
    /** How far over budget, as a whole percent. */
    overPct: number;
  };
  /** Mitigations to point the owner at — only true when the design has them. */
  links: {
    /** The R8 phased architecture (an MVP to fit the budget). */
    mvpPhase: boolean;
    /** The R7 out-of-scope list (things to cut). */
    outOfScope: boolean;
  };
}

/** Parsed budget range in USD, or null when the text carries no usable figure. */
export interface ParsedBudget {
  min: number;
  max: number;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Normalize Arabic-Indic + extended Arabic-Indic digits to Latin. */
function normalizeDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Tolerantly parse a stated budget into a USD range. Handles "$5k", "5000-8000",
 * "5,000 to 8,000", Arabic numerals ("٥٠٠٠ دولار"). Returns null on anything
 * without a usable figure — it never guesses. Numbers below $100 are treated as
 * noise (a stray "3pm"), not a budget.
 */
export function parseBudget(text: string | undefined | null): ParsedBudget | null {
  if (!text) return null;
  const normalized = normalizeDigits(text).toLowerCase().replace(/,/g, '');
  // The k/m multiplier only counts at a word boundary — otherwise a following
  // word ("5000 monthly", "8000 max") would be misread as thousands/millions.
  // The suffix is one optional group so a non-qualifying k/m leaves the number
  // whole instead of truncating a digit.
  const re = /(\d+(?:\.\d+)?)(?:\s*([km])\b)?/g;
  const nums: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    let n = parseFloat(match[1]);
    if (!Number.isFinite(n)) continue;
    if (match[2] === 'k') n *= 1_000;
    else if (match[2] === 'm') n *= 1_000_000;
    if (n >= 100) nums.push(n);
  }
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/**
 * Owner-facing budget reality check. Produces a warning only when the budget is
 * parseable AND the effort — costed at the LOW reference rate — exceeds the top of
 * the stated budget by more than 25%. Returns null otherwise (no budget, or it
 * comfortably fits). OWNER-ONLY: never include this on the public share payload.
 */
export function buildBudgetCheck(
  effort: EffortEstimate,
  budgetText: string | undefined | null,
  rates: ReferenceRates,
  mitigations?: { hasMvpPhase?: boolean; hasOutOfScope?: boolean },
): BudgetWarning | null {
  const budget = parseBudget(budgetText);
  if (!budget) return null;
  const estimatedLow = effort.weeksMax * rates.lowUsd;
  const overPct = ((estimatedLow - budget.max) / budget.max) * 100;
  if (overPct <= 25) return null;
  return {
    severity: overPct > 75 ? 'critical' : 'warning',
    messageKey: 'cost.budget.over',
    values: {
      estimatedLowUsd: Math.round(estimatedLow / 100) * 100,
      budgetMaxUsd: budget.max,
      overPct: Math.round(overPct),
    },
    links: {
      mvpPhase: !!mitigations?.hasMvpPhase,
      outOfScope: !!mitigations?.hasOutOfScope,
    },
  };
}

// ── Suggested price (owner-only) ────────────────────────────────────────────

export interface SuggestedPrice {
  min: number;
  max: number;
}

/** Owner's internal suggested price = effort range × their weekly rate. */
export function computeSuggestedPrice(
  effort: EffortEstimate,
  weeklyRate: number,
): SuggestedPrice {
  return {
    min: Math.round(effort.weeksMin * weeklyRate),
    max: Math.round(effort.weeksMax * weeklyRate),
  };
}
