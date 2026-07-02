import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CheckoutResponse } from '@archivato/shared';
import type { BillingProvider, StartCheckoutContext } from './billing.provider';
import type { Subscription } from './subscription.entity';

/**
 * Paddle (Billing) provider. Checkout runs client-side via Paddle.js using the
 * returned price id + client token; activation and cancellation are finalized by
 * webhooks (see BillingService.applyPaddleEvent). Cancellation also calls the
 * Paddle API so it takes effect at the period end.
 *
 * Requires env: PADDLE_API_KEY, PADDLE_PRICE_ID, PADDLE_CLIENT_TOKEN,
 * PADDLE_WEBHOOK_SECRET, PADDLE_ENV (sandbox|production).
 */
@Injectable()
export class PaddleBillingProvider implements BillingProvider {
  readonly id = 'paddle' as const;
  private readonly logger = new Logger(PaddleBillingProvider.name);

  constructor(private readonly config: ConfigService) {}

  async startProCheckout(ctx: StartCheckoutContext): Promise<CheckoutResponse> {
    return {
      status: 'checkout',
      paddle: {
        priceId: this.config.get<string>('PADDLE_PRICE_ID', ''),
        clientToken: this.config.get<string>('PADDLE_CLIENT_TOKEN', ''),
        environment:
          this.config.get<string>('PADDLE_ENV', 'sandbox') === 'production'
            ? 'production'
            : 'sandbox',
        customerEmail: ctx.email,
      },
    };
  }

  async cancel(subscription: Subscription): Promise<{ downgradeNow: boolean }> {
    const apiKey = this.config.get<string>('PADDLE_API_KEY');
    const subId = subscription.paddleSubscriptionId;
    if (apiKey && subId) {
      try {
        await fetch(`${this.apiBase()}/subscriptions/${subId}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ effective_from: 'next_billing_period' }),
        });
      } catch (err) {
        this.logger.error(`Paddle cancel failed: ${String(err)}`);
      }
    }
    // The subscription.canceled webhook flips our state at the period boundary.
    return { downgradeNow: false };
  }

  private apiBase(): string {
    return this.config.get<string>('PADDLE_ENV', 'sandbox') === 'production'
      ? 'https://api.paddle.com'
      : 'https://sandbox-api.paddle.com';
  }
}
