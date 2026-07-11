import { Inject, Injectable } from '@nestjs/common';
import {
  PLANS,
  SUPER_ADMIN_ROLE_KEY,
  type AccountRole,
  type AdminStats,
  type AdminTraffic,
  type AdminUserRow,
  type AdminUsersPage,
  type InterviewStatus,
  type SubscriptionPlan,
  type TimePoint,
} from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import { USER_REPOSITORY, type UserRepository } from '../auth/user.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import { RoleService } from '../roles/role.service';
import type { AnalyticsEvent } from '../analytics/analytics-event.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVIEW_STATUSES: InterviewStatus[] = [
  'collecting',
  'awaiting_confirmation',
  'confirmed',
];

/** Minimal subscription shape needed to resolve the effective plan. */
type SubLike = {
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
} | null;

/**
 * Read-only reporting for the superAdmin dashboard. Aggregates real product data
 * (users, projects, subscriptions) via Prisma plus analytics events via
 * `AnalyticsService`. This is a deliberate read-model: it queries Prisma directly
 * rather than routing every metric through a feature repository.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly roles: RoleService,
  ) {}

  /** Headline KPIs + 30-day signup/pageview trend series. */
  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since7 = new Date(now.getTime() - 7 * DAY_MS);
    const since1 = new Date(now.getTime() - DAY_MS);

    const [
      totalUsers,
      verified,
      admins,
      newToday,
      new7d,
      new30d,
      signupRows,
      totalProjects,
      projectGroups,
      proCount,
      events30,
      generationsTotal,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.user.count({ where: { role: 'admin' } }),
      this.prisma.user.count({ where: { createdAt: { gte: since1 } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since7 } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since30 } },
        select: { createdAt: true },
      }),
      this.prisma.interviewSession.count(),
      this.prisma.interviewSession.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.countEffectivePro(now),
      this.analytics.findSince(since30),
      this.analytics.countByType('generate'),
    ]);

    const pageviews30 = events30.filter((e) => e.type === 'pageview');
    const byStatus = INTERVIEW_STATUSES.reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<InterviewStatus, number>,
    );
    for (const g of projectGroups) {
      if ((INTERVIEW_STATUSES as string[]).includes(g.status)) {
        byStatus[g.status as InterviewStatus] = g._count._all;
      }
    }

    const uniqueVisitors7d = new Set(
      pageviews30
        .filter((e) => e.createdAt >= since7 && e.visitorId)
        .map((e) => e.visitorId),
    ).size;
    const activeUsers7d = new Set(
      events30
        .filter((e) => e.createdAt >= since7 && e.userId)
        .map((e) => e.userId),
    ).size;

    return {
      overview: {
        users: { total: totalUsers, newToday, new7d, new30d, verified, admins },
        projects: { total: totalProjects, byStatus },
        subscriptions: {
          free: Math.max(0, totalUsers - proCount),
          pro: proCount,
          mrrUsd: proCount * PLANS.pro.priceUsd,
        },
        traffic: {
          pageviews7d: pageviews30.filter((e) => e.createdAt >= since7).length,
          uniqueVisitors7d,
          activeUsers7d,
        },
        generations: {
          total: generationsTotal,
          last7d: events30.filter(
            (e) => e.type === 'generate' && e.createdAt >= since7,
          ).length,
        },
      },
      signups: bucketDaily(
        signupRows.map((r) => r.createdAt),
        30,
        now,
      ),
      pageviews: bucketDaily(
        pageviews30.map((e) => e.createdAt),
        30,
        now,
      ),
    };
  }

  /** Traffic detail: daily series + top pages/referrers over the last 30 days. */
  async getTraffic(): Promise<AdminTraffic> {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const events = await this.analytics.findSince(since30);
    const pageviews = events.filter((e) => e.type === 'pageview');

    return {
      pageviews: bucketDaily(
        pageviews.map((e) => e.createdAt),
        30,
        now,
      ),
      uniqueVisitors: bucketDailyUnique(pageviews, 30, now),
      topPages: topBy(pageviews, (e) => e.path).slice(0, 10),
      topReferrers: topBy(pageviews, (e) => normalizeReferrer(e.referrer))
        .slice(0, 10)
        .map((r) => ({ referrer: r.path, count: r.count })),
      topCountries: topBy(pageviews, (e) => e.country)
        .slice(0, 10)
        .map((r) => ({ country: r.path, count: r.count })),
      totals: {
        pageviews: pageviews.length,
        uniqueVisitors: new Set(
          pageviews.filter((e) => e.visitorId).map((e) => e.visitorId),
        ).size,
      },
    };
  }

  /** A page of users with their plan + project count, newest first. */
  async getUsers(page = 1, pageSize = 20): Promise<AdminUsersPage> {
    const now = new Date();
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = Math.max(page - 1, 0) * take;

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { subscription: true },
      }),
      this.prisma.user.count(),
    ]);

    const counts = await this.prisma.interviewSession.groupBy({
      by: ['userId'],
      _count: { _all: true },
      where: { userId: { in: rows.map((r) => r.id) } },
    });
    const countMap = new Map(
      counts.map((c) => [c.userId, c._count._all] as const),
    );

    const roleKeys = await Promise.all(
      rows.map((r) => this.roles.roleKeysForUser(r.id)),
    );

    const users: AdminUserRow[] = rows.map((r, i) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      role: r.role as AccountRole,
      roles: roleKeys[i],
      emailVerified: r.emailVerified,
      providers: r.providers as AdminUserRow['providers'],
      plan: effectivePlan(r.subscription, now),
      projectCount: countMap.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));

    return { users, total };
  }

  /**
   * Promote/demote a user's coarse role. Bridges to RBAC: `admin` grants the
   * super-admin role (full permissions), `user` removes it. The legacy `role`
   * column is kept in sync for back-compat. Fine-grained role assignment lives
   * in the dedicated role-management API.
   */
  async setRole(userId: string, role: AccountRole): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;
    if (role === 'admin') {
      await this.roles.assignByKey(userId, SUPER_ADMIN_ROLE_KEY);
    } else {
      await this.roles.removeByKey(userId, SUPER_ADMIN_ROLE_KEY);
    }
    await this.users.save({ ...user, role });
  }

  /** Delete a user (cascades their sessions + projects). */
  async deleteUser(userId: string): Promise<void> {
    await this.users.delete(userId);
  }

  /** Count subscriptions whose effective plan is Pro (active + within period). */
  private countEffectivePro(now: Date): Promise<number> {
    return this.prisma.subscription.count({
      where: {
        plan: 'pro',
        status: 'active',
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      },
    });
  }
}

/** Pro only while the subscription is active and within its billing period. */
function effectivePlan(sub: SubLike, now: Date): SubscriptionPlan {
  if (!sub) return 'free';
  const inPeriod = !sub.currentPeriodEnd || sub.currentPeriodEnd > now;
  return sub.plan === 'pro' && sub.status === 'active' && inPeriod
    ? 'pro'
    : 'free';
}

/** Bucket timestamps into a dense daily series (oldest → newest, zero-filled). */
function bucketDaily(dates: Date[], days: number, now: Date): TimePoint[] {
  const series = emptyDays(days, now);
  for (const d of dates) {
    const key = dayKey(d);
    if (series.has(key)) series.set(key, (series.get(key) ?? 0) + 1);
  }
  return [...series].map(([date, value]) => ({ date, value }));
}

/** Like bucketDaily but counts distinct visitor ids per day. */
function bucketDailyUnique(
  events: AnalyticsEvent[],
  days: number,
  now: Date,
): TimePoint[] {
  const sets = new Map<string, Set<string>>();
  for (const key of emptyDays(days, now).keys()) sets.set(key, new Set());
  for (const e of events) {
    const key = dayKey(e.createdAt);
    if (e.visitorId && sets.has(key)) sets.get(key)!.add(e.visitorId);
  }
  return [...sets].map(([date, set]) => ({ date, value: set.size }));
}

function emptyDays(days: number, now: Date): Map<string, number> {
  const map = new Map<string, number>();
  const start = startOfUtcDay(now);
  for (let i = days - 1; i >= 0; i--) {
    map.set(dayKey(new Date(start.getTime() - i * DAY_MS)), 0);
  }
  return map;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Count occurrences by a key extractor, sorted desc; skips empty keys. */
function topBy(
  events: AnalyticsEvent[],
  key: (e: AnalyticsEvent) => string | null,
): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const k = key(e);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
}

/** Bucket a referrer to its host (or "Direct" when absent). */
function normalizeReferrer(referrer: string | null): string {
  if (!referrer) return 'Direct';
  try {
    return new URL(referrer).host || 'Direct';
  } catch {
    return referrer.slice(0, 60);
  }
}
