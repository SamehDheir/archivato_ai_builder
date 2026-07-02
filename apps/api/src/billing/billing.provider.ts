import type { BillingProviderId, CheckoutResponse } from '@archivato/shared';
import type { Subscription } from './subscription.entity';

/** DI token for the active billing provider (mock | paddle). */
export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');

/** Context the provider needs to start a checkout. */
export interface StartCheckoutContext {
  userId: string;
  email: string;
  subscription: Subscription;
}

/**
 * Payment-backend seam (mirrors `LlmProvider`). The BillingService owns all
 * subscription STATE; the provider only performs the payment-side action and
 * tells the service whether to apply the change immediately (mock) or wait for
 * a webhook (paddle).
 */
export interface BillingProvider {
  readonly id: BillingProviderId;

  /**
   * Begin an upgrade to Pro. Mock returns `{ status: 'activated' }` (the service
   * then flips the subscription to pro right away); Paddle returns
   * `{ status: 'checkout', paddle }` for the client to open the overlay, and the
   * real activation arrives via webhook.
   */
  startProCheckout(ctx: StartCheckoutContext): Promise<CheckoutResponse>;

  /**
   * Cancel the Pro subscription on the provider side. Returns whether the
   * service should downgrade state now (mock: true) or wait for a
   * `subscription.canceled` webhook (paddle: false).
   */
  cancel(subscription: Subscription): Promise<{ downgradeNow: boolean }>;
}
