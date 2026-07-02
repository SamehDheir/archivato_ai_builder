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
      'Interview → requirements → system & database design',
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
      'Up to 5 projects',
      'API design, AI review & roadmap',
      'Export to JSON / Markdown / OpenAPI',
    ],
  },
};
