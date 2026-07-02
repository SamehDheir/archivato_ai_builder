import { Injectable } from '@nestjs/common';
import type { CheckoutResponse } from '@archivato/shared';
import type { BillingProvider } from './billing.provider';

/**
 * Offline billing provider (the default). Upgrade applies immediately with no
 * external call or charge, so the subscription system is fully demoable and
 * testable without a Paddle account. Cancel is at-period-end (like Paddle): the
 * user keeps Pro until `currentPeriodEnd`, then `effectivePlan` drops them to
 * Free automatically. Swap in `PaddleBillingProvider` by setting
 * `BILLING_PROVIDER=paddle` (or providing Paddle keys).
 */
@Injectable()
export class MockBillingProvider implements BillingProvider {
  readonly id = 'mock' as const;

  async startProCheckout(): Promise<CheckoutResponse> {
    return { status: 'activated' };
  }

  async cancel(): Promise<{ downgradeNow: boolean }> {
    return { downgradeNow: false };
  }
}
