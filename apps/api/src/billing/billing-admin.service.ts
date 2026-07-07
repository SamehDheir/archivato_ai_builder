import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PLANS,
  monthlyEquivalent,
  type BillingAdminData,
  type BillingAdminFilter,
  type BillingAdminSummary,
  type BillingCycle,
  type BillingEventType,
  type BillingEventView,
  type BillingSubscriptionDetail,
  type BillingSubscriptionRow,
  type BillingTrendPoint,
  type BillingTrends,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_PROVIDER, type BillingProvider } from './billing.provider';
import {
  BILLING_EVENT_REPOSITORY,
  type BillingEventRepository,
} from './billing-event.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_PRO_EVENTS: BillingEventType[] = ['checkout', 'admin_grant_pro'];
const CHURN_EVENTS: BillingEventType[] = ['cancel', 'admin_revoke'];

/**
 * Read-only reporting for the **billing-admin** console (`billing:manage`).
 * Like `AdminService`, a deliberate Prisma read-model: it reads subscriptions +
 * the joined user and the billing-event audit log, never mutates (writes go
 * through `BillingService`).
 */
@Injectable()
export class BillingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(BILLING_EVENT_REPOSITORY)
    private readonly events: BillingEventRepository,
  ) {}

  /** KPIs (global) + a filtered, paginated page of subscription records. */
  async overview(filter: BillingAdminFilter = {}): Promise<BillingAdminData> {
    const now = new Date();
    const page = Math.max(filter.page ?? 1, 1);
    const take = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const skip = (page - 1) * take;

    const effectiveProWhere = {
      plan: 'pro',
      status: 'active',
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    };

    // The table filter (does not affect the global KPIs).
    const q = filter.q?.trim();
    const listWhere: Record<string, unknown> = {};
    if (filter.plan) listWhere.plan = filter.plan;
    if (filter.status) listWhere.status = filter.status;
    if (q) {
      listWhere.user = {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [totalUsers, proActive, annualProActive, pastDue, canceling, matching, rows] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.subscription.count({ where: effectiveProWhere }),
        this.prisma.subscription.count({
          where: { ...effectiveProWhere, billingCycle: 'annual' },
        }),
        this.prisma.subscription.count({ where: { status: 'past_due' } }),
        this.prisma.subscription.count({
          where: { ...effectiveProWhere, cancelAtPeriodEnd: true },
        }),
        this.prisma.subscription.count({ where: listWhere }),
        this.prisma.subscription.findMany({
          where: listWhere,
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
          include: { user: { select: { email: true, displayName: true } } },
        }),
      ]);

    // MRR normalizes cadence: an annual Pro contributes annualPrice/12 per month.
    const monthlyProActive = Math.max(0, proActive - annualProActive);
    const mrrUsd =
      Math.round(
        (monthlyProActive * monthlyEquivalent(PLANS.pro, 'monthly') +
          annualProActive * monthlyEquivalent(PLANS.pro, 'annual')) *
          100,
      ) / 100;
    const summary: BillingAdminSummary = {
      totalUsers,
      proActive,
      free: Math.max(0, totalUsers - proActive),
      canceling,
      pastDue,
      mrrUsd,
      arpuUsd: totalUsers ? Math.round((mrrUsd / totalUsers) * 100) / 100 : 0,
      provider: this.provider.id,
    };

    return {
      summary,
      subscriptions: rows.map((r) => this.toRow(r, now)),
      total: matching,
      filter: { ...filter, page, pageSize: take },
    };
  }

  /** Full billing detail for one customer + their recent events. */
  async detail(userId: string): Promise<BillingSubscriptionDetail> {
    const now = new Date();
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { user: { select: { email: true, displayName: true } } },
    });
    if (!sub) {
      throw new NotFoundException('No subscription for this user.');
    }
    const events = await this.events.findByUserId(userId, 50);
    return {
      ...this.toRow(sub, now),
      periodStart: sub.currentPeriodStart
        ? sub.currentPeriodStart.toISOString()
        : null,
      paddleCustomerId: sub.paddleCustomerId,
      paddleSubscriptionId: sub.paddleSubscriptionId,
      events: events.map(
        (e): BillingEventView => ({
          id: e.id,
          type: e.type,
          actorId: e.actorId,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        }),
      ),
    };
  }

  /** 30-day new-Pro + churn series, derived from the billing-event log. */
  async trends(): Promise<BillingTrends> {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const events = await this.events.findSince(since);
    return {
      newPro: bucketDaily(
        events.filter((e) => NEW_PRO_EVENTS.includes(e.type)).map((e) => e.createdAt),
        30,
        now,
      ),
      churn: bucketDaily(
        events.filter((e) => CHURN_EVENTS.includes(e.type)).map((e) => e.createdAt),
        30,
        now,
      ),
    };
  }

  /** Map a subscription row (+ joined user) to the client shape. */
  private toRow(
    r: {
      userId: string;
      plan: string;
      status: string;
      billingCycle: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
      paddleSubscriptionId: string | null;
      createdAt: Date;
      updatedAt: Date;
      user: { email: string; displayName: string };
    },
    now: Date,
  ): BillingSubscriptionRow {
    const inPeriod = !r.currentPeriodEnd || r.currentPeriodEnd > now;
    const effectivePlan: SubscriptionPlan =
      r.plan === 'pro' && r.status === 'active' && inPeriod ? 'pro' : 'free';
    return {
      userId: r.userId,
      email: r.user.email,
      displayName: r.user.displayName,
      plan: r.plan as SubscriptionPlan,
      effectivePlan,
      status: r.status as SubscriptionStatus,
      cancelAtPeriodEnd: r.cancelAtPeriodEnd,
      periodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.toISOString() : null,
      billingCycle: (r.billingCycle as BillingCycle) ?? 'monthly',
      paddle: Boolean(r.paddleSubscriptionId),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

/** Bucket timestamps into a dense daily series (oldest → newest, zero-filled). */
function bucketDaily(dates: Date[], days: number, now: Date): BillingTrendPoint[] {
  const map = new Map<string, number>();
  const start = startOfUtcDay(now);
  for (let i = days - 1; i >= 0; i--) {
    map.set(dayKey(new Date(start.getTime() - i * DAY_MS)), 0);
  }
  for (const d of dates) {
    const key = dayKey(d);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map].map(([date, value]) => ({ date, value }));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
