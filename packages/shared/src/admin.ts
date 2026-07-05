/**
 * SuperAdmin dashboard + analytics domain types (shared between API and web).
 * The admin panel aggregates real product data (users, projects, subscriptions)
 * plus lightweight analytics events (anonymous landing pageviews + product
 * events). Keep this file runtime-free.
 */

import type { AccountRole, AuthProvider } from './auth';
import type { SubscriptionPlan } from './billing';
import type { InterviewStatus } from './interview';
import type { Permission } from './permissions';

/** The kinds of analytics events we record. */
export type AnalyticsEventType = 'pageview' | 'signup' | 'login' | 'generate';

/**
 * Payload for the public `POST /analytics/track` beacon. Clients may only report
 * pageviews (product events are recorded server-side, where they can't be
 * spoofed). The server stamps the visitor id (cookie) + timestamp.
 */
export interface TrackEventInput {
  path: string;
  referrer?: string;
}

/** A single point in a daily time series (ISO `date` → `value`). */
export interface TimePoint {
  date: string;
  value: number;
}

/** Headline KPIs for the admin overview. */
export interface AdminOverview {
  users: {
    total: number;
    newToday: number;
    new7d: number;
    new30d: number;
    verified: number;
    admins: number;
  };
  projects: {
    total: number;
    /** Count per interview status (collecting / awaiting_confirmation / confirmed). */
    byStatus: Record<InterviewStatus, number>;
  };
  subscriptions: {
    free: number;
    pro: number;
    /** Monthly recurring revenue estimate in USD (active Pro subs × price). */
    mrrUsd: number;
  };
  traffic: {
    pageviews7d: number;
    uniqueVisitors7d: number;
    /** Distinct signed-in users active in the last 7 days. */
    activeUsers7d: number;
  };
  generations: {
    total: number;
    last7d: number;
  };
}

/** The admin dashboard's overview payload: KPIs + 30-day trend series. */
export interface AdminStats {
  overview: AdminOverview;
  /** Daily new signups, last 30 days. */
  signups: TimePoint[];
  /** Daily pageviews, last 30 days. */
  pageviews: TimePoint[];
}

/** One row of the admin users table. */
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: AccountRole;
  /** RBAC role keys assigned to the user (for the roles column + editor). */
  roles: string[];
  emailVerified: boolean;
  providers: AuthProvider[];
  plan: SubscriptionPlan;
  projectCount: number;
  createdAt: string;
}

/** Paginated users list for the admin table. */
export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
}

// ── RBAC role management (admin) ──────────────────────────────────────────────

/** A role as shown in the role-management UI. */
export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  /** How many users currently hold this role. */
  userCount: number;
}

/** Body for creating a role. */
export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: Permission[];
}

/** Body for editing a role (system roles: name/description/permissions only). */
export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: Permission[];
}

/** Body for replacing a user's whole role set. */
export interface SetUserRolesInput {
  roleIds: string[];
}

/** Traffic detail: daily series + top pages/referrers. */
export interface AdminTraffic {
  pageviews: TimePoint[];
  uniqueVisitors: TimePoint[];
  topPages: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  totals: { pageviews: number; uniqueVisitors: number };
}
