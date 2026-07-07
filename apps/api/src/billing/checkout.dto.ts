import { IsIn, IsOptional } from 'class-validator';
import { BILLING_CYCLES, type BillingCycle } from '@archivato/shared';

/** Body of `POST /billing/checkout`. Cadence is optional and defaults to monthly. */
export class CheckoutDto {
  @IsOptional()
  @IsIn([...BILLING_CYCLES])
  billingCycle?: BillingCycle;
}
