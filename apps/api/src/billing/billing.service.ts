import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PLANS,
  type BillingCycle,
  type CheckoutResponse,
  type SubscriptionPlan,
  type SubscriptionView,
} from '@archivato/shared';
import type { BillingEventType } from '@archivato/shared';
import { USER_REPOSITORY, type UserRepository } from '../auth/user.repository';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from './subscription.repository';
import {
  BILLING_EVENT_REPOSITORY,
  type BillingEventRepository,
} from './billing-event.repository';
import { BILLING_PROVIDER, type BillingProvider } from './billing.provider';
import type { Subscription } from './subscription.entity';

/** Mock Pro period length per cadence (Paddle supplies real dates via webhook). */
const PRO_PERIOD_DAYS: Record<BillingCycle, number> = {
  monthly: 30,
  annual: 365,
};

/** Minimal shape of a Paddle webhook event we care about. */
interface PaddleEvent {
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    custom_data?: { user_id?: string } | null;
    current_billing_period?: { starts_at?: string; ends_at?: string } | null;
  };
}

/**
 * Subscriptions + the plan's PROJECT-COUNT quota. Capacity is metered as the
 * maximum number of projects a user may own (Free = 1, Pro = 5); the interview
 * module enforces it at project creation via `getProjectQuota`. This service
 * owns plan state (upgrade/cancel/webhooks) but never counts projects itself —
 * that belongs to the interview domain.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subs: SubscriptionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(BILLING_EVENT_REPOSITORY)
    private readonly events: BillingEventRepository,
  ) {}

  /** Append a billing event, best-effort — auditing never breaks a billing flow. */
  private record(
    userId: string,
    type: BillingEventType,
    actorId: string | null = null,
    note: string | null = null,
  ): void {
    void this.events.create({ userId, type, actorId, note }).catch(() => undefined);
  }

  /** The user's subscription, creating a default free one on first access. */
  async getOrCreate(userId: string): Promise<Subscription> {
    const existing = await this.subs.findByUserId(userId);
    return existing ?? this.subs.create({ userId });
  }

  /** How many projects the user's current plan allows (the enforced cap). */
  async getProjectQuota(userId: string): Promise<number> {
    const sub = await this.getOrCreate(userId);
    return PLANS[this.effectivePlan(sub)].projectQuota;
  }

  /** Whether the user is on an active Pro plan. */
  async isPro(userId: string): Promise<boolean> {
    const sub = await this.getOrCreate(userId);
    return this.effectivePlan(sub) === 'pro';
  }

  /**
   * The plan in force for a user — **read-only**: unlike `getOrCreate`, this
   * never writes a subscription row, and a user without one simply reads as free.
   *
   * That matters because the caller is the *public* share page: it runs for every
   * anonymous visitor to a link, so it must not turn a read into a write (nor
   * create rows on behalf of a user who isn't even the one browsing). A null
   * `userId` (a legacy owner-less session) is free — the safe default, since
   * getting it wrong would silently strip a paying owner's watermark exemption or
   * hand a free owner an unwatermarked page.
   */
  async planFor(userId: string | null): Promise<SubscriptionPlan> {
    if (!userId) return 'free';
    const sub = await this.subs.findByUserId(userId);
    return sub ? this.effectivePlan(sub) : 'free';
  }

  /**
   * Gate Pro-only generation (the API design and everything after it — review,
   * roadmap, export). 402s for free users so the client can prompt an upgrade.
   */
  async assertPro(userId: string): Promise<void> {
    if (await this.isPro(userId)) return;
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        code: 'upgrade_required',
        message:
          'The API design — and the review, roadmap, and export that follow — are Pro features. Upgrade to Pro to continue.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /** The live plan + quota for the client (project count is added by the caller). */
  async getView(userId: string): Promise<SubscriptionView> {
    const sub = await this.getOrCreate(userId);
    const plan = this.effectivePlan(sub);
    return {
      plan,
      status: sub.status,
      projectQuota: PLANS[plan].projectQuota,
      periodEnd:
        plan === 'pro' ? (sub.currentPeriodEnd?.toISOString() ?? null) : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      billingCycle: sub.billingCycle,
      provider: this.provider.id,
    };
  }

  /**
   * Start (or, in mock mode, immediately apply) an upgrade to Pro. The chosen
   * cadence is persisted first (so the Paddle checkout label + eventual mock
   * activation both reflect it) and drives the mock period length.
   */
  async startCheckout(
    userId: string,
    cycle: BillingCycle = 'monthly',
  ): Promise<CheckoutResponse> {
    let sub = await this.getOrCreate(userId);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    // Persist the chosen cadence up front so the Paddle activation webhook (which
    // doesn't carry the cadence) preserves it and its period-length fallback is
    // right. This means a Free user mid-Paddle-checkout briefly reads as their
    // *pending* cadence; entitlement (isPro/quota) is unaffected. The mock/default
    // path activates immediately, so there's no such window there.
    if (sub.billingCycle !== cycle) {
      sub = await this.subs.save({ ...sub, billingCycle: cycle });
    }

    const response = await this.provider.startProCheckout({
      userId,
      email: user.email,
      subscription: sub,
      cycle,
    });
    if (response.status === 'activated') {
      const now = new Date();
      await this.applyProState(sub, {
        periodStart: now,
        periodEnd: addDays(now, PRO_PERIOD_DAYS[cycle]),
      });
      this.record(userId, 'checkout', userId);
    }
    return response;
  }

  /** Cancel Pro (immediate in mock; at period end via webhook for Paddle). */
  async cancel(userId: string): Promise<SubscriptionView> {
    const sub = await this.getOrCreate(userId);
    if (this.effectivePlan(sub) !== 'pro') return this.getView(userId);

    const { downgradeNow } = await this.provider.cancel(sub);
    if (downgradeNow) {
      await this.downgradeToFree(sub);
    } else {
      sub.cancelAtPeriodEnd = true;
      await this.subs.save(sub);
    }
    this.record(userId, 'cancel', userId);
    return this.getView(userId);
  }

  /**
   * Admin: comp a user to Pro (no payment) — a perpetual grant until revoked.
   * Refuses Paddle-backed subscriptions (those must be changed in Paddle, or the
   * local state would desync from the source of truth). Records an audit event.
   */
  async adminGrantPro(userId: string, actorId: string): Promise<void> {
    const sub = await this.getOrCreate(userId);
    if (sub.paddleSubscriptionId) this.throwPaddleManaged();
    await this.subs.save({
      ...sub,
      plan: 'pro',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(),
      currentPeriodEnd: null, // no expiry — a comped grant
    });
    this.record(userId, 'admin_grant_pro', actorId);
    this.logger.log(`Admin ${actorId} granted Pro to ${userId}`);
  }

  /** Admin: immediately downgrade a user to Free. Refuses Paddle-backed subs. */
  async adminRevoke(userId: string, actorId: string): Promise<void> {
    const sub = await this.getOrCreate(userId);
    if (sub.paddleSubscriptionId) this.throwPaddleManaged();
    await this.downgradeToFree(sub);
    this.record(userId, 'admin_revoke', actorId);
    this.logger.log(`Admin ${actorId} revoked Pro from ${userId}`);
  }

  private throwPaddleManaged(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'paddle_managed',
        message:
          'This subscription is managed by Paddle — change it in the Paddle dashboard.',
      },
      HttpStatus.CONFLICT,
    );
  }

  /** Apply a verified Paddle webhook event to the matching subscription. */
  async applyPaddleEvent(event: PaddleEvent): Promise<void> {
    const type = event.event_type ?? '';
    const data = event.data ?? {};
    const paddleSubId = data.id;
    const userId = data.custom_data?.user_id;

    let sub = paddleSubId
      ? await this.subs.findByPaddleSubscriptionId(paddleSubId)
      : null;
    if (!sub && userId) sub = await this.getOrCreate(userId);
    if (!sub) {
      this.logger.warn(`Paddle event ${type}: no matching subscription`);
      return;
    }

    const active = data.status === 'active' || data.status === 'trialing';
    if (type === 'subscription.canceled' || data.status === 'canceled') {
      await this.downgradeToFree(sub);
      this.record(sub.userId, 'cancel');
      return;
    }
    if (
      active &&
      (type === 'subscription.activated' ||
        type === 'subscription.created' ||
        type === 'subscription.updated')
    ) {
      const wasPro = this.effectivePlan(sub) === 'pro';
      const now = new Date();
      const start = data.current_billing_period?.starts_at
        ? new Date(data.current_billing_period.starts_at)
        : now;
      const end = data.current_billing_period?.ends_at
        ? new Date(data.current_billing_period.ends_at)
        : addDays(now, PRO_PERIOD_DAYS[sub.billingCycle]);
      await this.applyProState(sub, {
        periodStart: start,
        periodEnd: end,
        paddleCustomerId: data.customer_id ?? null,
        paddleSubscriptionId: paddleSubId ?? null,
      });
      // Only count a genuine new activation (not a routine period update).
      if (!wasPro) this.record(sub.userId, 'checkout');
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  /** The plan currently in force — pro only while active and within its period. */
  private effectivePlan(sub: Subscription): SubscriptionPlan {
    const inPeriod =
      !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now();
    return sub.plan === 'pro' && sub.status === 'active' && inPeriod
      ? 'pro'
      : 'free';
  }

  private async applyProState(
    sub: Subscription,
    opts: {
      periodStart: Date;
      periodEnd: Date;
      paddleCustomerId?: string | null;
      paddleSubscriptionId?: string | null;
    },
  ): Promise<void> {
    await this.subs.save({
      ...sub,
      plan: 'pro',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: opts.periodStart,
      currentPeriodEnd: opts.periodEnd,
      paddleCustomerId: opts.paddleCustomerId ?? sub.paddleCustomerId,
      paddleSubscriptionId: opts.paddleSubscriptionId ?? sub.paddleSubscriptionId,
    });
  }

  private async downgradeToFree(sub: Subscription): Promise<void> {
    await this.subs.save({
      ...sub,
      plan: 'free',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
