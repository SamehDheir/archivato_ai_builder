import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthUser,
  BillingAdminData,
  BillingSubscriptionDetail,
  BillingTrends,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingAdminService } from './billing-admin.service';
import { BillingService } from './billing.service';

/**
 * Billing-admin console API — RBAC-gated by `billing:manage` (Billing Admin +
 * Super Admin). Read reporting (overview / detail / trends) plus the two write
 * actions an operator needs: comp a user to Pro, or revoke it.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('billing:manage')
@Controller('billing/admin')
export class BillingAdminController {
  constructor(
    private readonly billingAdmin: BillingAdminService,
    private readonly billing: BillingService,
  ) {}

  /** KPIs + a filtered, paginated page of subscription records. */
  @Get()
  overview(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ): Promise<BillingAdminData> {
    return this.billingAdmin.overview({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      plan: plan === 'free' || plan === 'pro' ? (plan as SubscriptionPlan) : undefined,
      status: isStatus(status) ? status : undefined,
      q: q || undefined,
    });
  }

  /** 30-day new-Pro + churn series (from the billing-event log). */
  @Get('trends')
  trends(): Promise<BillingTrends> {
    return this.billingAdmin.trends();
  }

  /** Full billing detail + event history for one customer. */
  @Get('subscriptions/:userId')
  detail(@Param('userId') userId: string): Promise<BillingSubscriptionDetail> {
    return this.billingAdmin.detail(userId);
  }

  /** Comp a user to Pro (no charge). Returns the refreshed detail. */
  @Post('subscriptions/:userId/grant-pro')
  @HttpCode(200)
  async grantPro(
    @Param('userId') userId: string,
    @CurrentUser() me: AuthUser,
  ): Promise<BillingSubscriptionDetail> {
    await this.billing.adminGrantPro(userId, me.id);
    return this.billingAdmin.detail(userId);
  }

  /** Immediately downgrade a user to Free. Returns the refreshed detail. */
  @Post('subscriptions/:userId/revoke')
  @HttpCode(200)
  async revoke(
    @Param('userId') userId: string,
    @CurrentUser() me: AuthUser,
  ): Promise<BillingSubscriptionDetail> {
    await this.billing.adminRevoke(userId, me.id);
    return this.billingAdmin.detail(userId);
  }
}

function isStatus(v: string | undefined): v is SubscriptionStatus {
  return v === 'active' || v === 'canceled' || v === 'past_due';
}
