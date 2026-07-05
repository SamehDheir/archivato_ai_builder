/**
 * Billing / subscription domain types (shared between API and web).
 *
 * The subscription is metered as a PROJECT QUOTA, not a dollar wallet: the
 * dollar amounts below are plan prices. A "project" consumes one quota slot when
 * its interview is confirmed (where real design generation begins). Keep this
 * file runtime-free.
 */

export type SubscriptionPlan = 'free' | 'pro';

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due';

/** Which billing backend is active (mirrors the LlmProvider pattern). */
export type BillingProviderId = 'mock' | 'paddle';

/** Static description of a plan. */
export interface PlanInfo {
  plan: SubscriptionPlan;
  name: string;
  /** Price in USD (0 for free). */
  priceUsd: number;
  /** How many projects the plan allows. */
  projectQuota: number;
  /** `once` = lifetime quota (free); `month` = quota resets each billing cycle. */
  interval: 'once' | 'month';
  /** Short marketing bullets for the pricing UI. */
  features: string[];
}

/**
 * The signed-in user's live plan. `projectQuota` is the max number of projects
 * they may own; the client compares it against the actual project count (owned
 * projects are the meter — see the interview/projects list).
 */
export interface SubscriptionView {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  projectQuota: number;
  /** End of the current pro billing period (ISO), or null for free. */
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: BillingProviderId;
}

// ── Billing admin console (billing:manage) ───────────────────────────────────

/** Headline subscription/revenue KPIs for the billing-admin dashboard. */
export interface BillingAdminSummary {
  totalUsers: number;
  /** Subscriptions whose EFFECTIVE plan is Pro (active + within the period). */
  proActive: number;
  free: number;
  /** Effective-Pro subs set to cancel at period end. */
  canceling: number;
  pastDue: number;
  /** Monthly recurring revenue estimate in USD (active Pro × price). */
  mrrUsd: number;
  /** Average revenue per user (MRR ÷ total users), 0 when there are no users. */
  arpuUsd: number;
  /** The active billing backend (mock offline vs Paddle). */
  provider: BillingProviderId;
}

/** One row of the billing-admin subscriptions table. */
export interface BillingSubscriptionRow {
  userId: string;
  email: string;
  displayName: string;
  /** The stored plan on the subscription row. */
  plan: SubscriptionPlan;
  /** Pro only while active + within the billing period; else free. */
  effectivePlan: SubscriptionPlan;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  /** End of the current Pro billing period (ISO), or null. */
  periodEnd: string | null;
  /** Whether this subscription is backed by a real Paddle subscription. */
  paddle: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The billing-admin overview payload: KPIs + a page of subscription rows. */
export interface BillingAdminData {
  summary: BillingAdminSummary;
  subscriptions: BillingSubscriptionRow[];
  /** Total subscription records matching the filter (for pagination). */
  total: number;
  /** Echo of the applied filter (so the client can keep its controls in sync). */
  filter: BillingAdminFilter;
}

/** Query filter for the billing-admin subscriptions table. */
export interface BillingAdminFilter {
  /** Filter by the stored plan column. */
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  /** Case-insensitive search over customer email / display name. */
  q?: string;
  page?: number;
  pageSize?: number;
}

/** An audited billing lifecycle event (for trends + per-customer history). */
export type BillingEventType =
  | 'checkout'
  | 'cancel'
  | 'admin_grant_pro'
  | 'admin_revoke';

/** A billing event as shown in the customer detail timeline. */
export interface BillingEventView {
  id: string;
  type: BillingEventType;
  /** The admin who performed an admin action (null for self-serve/system). */
  actorId: string | null;
  note: string | null;
  createdAt: string;
}

/** Full billing detail for one customer (drill-in), including recent events. */
export interface BillingSubscriptionDetail extends BillingSubscriptionRow {
  periodStart: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  events: BillingEventView[];
}

/** A single point in a daily series (kept local to avoid a cross-module cycle). */
export interface BillingTrendPoint {
  date: string;
  value: number;
}

/** 30-day billing trends derived from the event log. */
export interface BillingTrends {
  /** New Pro activations per day (checkout + admin grants). */
  newPro: BillingTrendPoint[];
  /** Churn per day (cancellations + admin revokes). */
  churn: BillingTrendPoint[];
}

/**
 * Result of starting a Pro checkout. In mock mode the upgrade is applied
 * server-side immediately (`status: 'activated'`). With Paddle the client opens
 * the checkout overlay using the returned parameters (`status: 'checkout'`).
 */
export interface CheckoutResponse {
  status: 'activated' | 'checkout';
  paddle?: {
    priceId: string;
    clientToken: string;
    environment: 'sandbox' | 'production';
    customerEmail: string;
  };
}

/** Canonical plan definitions — free = 1 project ever, pro = $19/mo for 5. */
export const PLANS: Record<SubscriptionPlan, PlanInfo> = {
  free: {
    plan: 'free',
    name: 'Free',
    priceUsd: 0,
    projectQuota: 1,
    interval: 'once',
    features: [
      '1 project',
      'Adaptive AI interview → requirements',
      'System & database design (with diagrams & canvas)',
      'Product Vision',
    ],
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    priceUsd: 19,
    projectQuota: 5,
    interval: 'month',
    features: [
      'Up to 5 projects (Free includes 1)',
      'REST API design — endpoints, request/response schemas & status codes',
      'AI Architect Review — scored on security, scalability, performance & cost, with critical-issue callouts',
      'Implementation roadmap — phases → milestones → tasks with effort estimates',
      'Interactive OpenAPI / Swagger API explorer',
      'Refine the whole design by chat — every change versioned',
      'Export to JSON, Markdown & OpenAPI (import straight into Postman)',
      'Scaffold a ready-to-build project repo + Print / Save as PDF',
    ],
  },
};
