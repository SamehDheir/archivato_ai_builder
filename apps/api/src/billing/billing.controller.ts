import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  PLANS,
  type AuthUser,
  type CheckoutResponse,
  type PlanInfo,
  type SubscriptionView,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';
import { CheckoutDto } from './checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  /** Public pricing info (no auth) — the plans and what they include. */
  @Get('plans')
  plans(): PlanInfo[] {
    return Object.values(PLANS);
  }

  /** The signed-in user's subscription + quota usage. */
  @Get()
  @UseGuards(JwtAuthGuard)
  subscription(@CurrentUser() user: AuthUser): Promise<SubscriptionView> {
    return this.billing.getView(user.id);
  }

  /** Start an upgrade to Pro (mock activates immediately; Paddle returns checkout). */
  @Post('checkout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  checkout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckoutDto,
  ): Promise<CheckoutResponse> {
    return this.billing.startCheckout(user.id, dto.billingCycle ?? 'monthly');
  }

  /** Cancel Pro (immediate in mock; effective at period end via Paddle). */
  @Post('cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: AuthUser): Promise<SubscriptionView> {
    return this.billing.cancel(user.id);
  }

  /**
   * Paddle webhook (no auth — verified by HMAC signature over the raw body).
   * Drives subscription activation/cancellation from Paddle's events.
   */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paddle-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    const secret = this.config.get<string>('PADDLE_WEBHOOK_SECRET');
    const raw = req.rawBody;
    if (!secret || !raw || !signature || !verifySignature(raw, signature, secret)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    await this.billing.applyPaddleEvent(JSON.parse(raw.toString('utf8')));
    return { received: true };
  }
}

/** Verify a Paddle `Paddle-Signature: ts=…;h1=…` header (HMAC-SHA256). */
function verifySignature(
  rawBody: Buffer,
  header: string,
  secret: string,
): boolean {
  const parts = Object.fromEntries(
    header.split(';').map((kv) => kv.split('=') as [string, string]),
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  const expected = createHmac('sha256', secret)
    .update(`${ts}:${rawBody.toString('utf8')}`)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(h1));
  } catch {
    return false;
  }
}
