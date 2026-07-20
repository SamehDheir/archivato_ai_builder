/**
 * SuperAdmin dashboard + analytics domain types (shared between API and web).
 * The admin panel aggregates real product data (users, projects, subscriptions)
 * plus lightweight analytics events (anonymous landing pageviews + product
 * events). Keep this file runtime-free.
 */

import type { AccountRole, AuthProvider } from './auth';
import type { SubscriptionPlan } from './billing';
import type { InterviewStatus } from './interview';
// Type-only, so the admin ↔ llm-usage import pair is erased at compile time.
import type { UserAiSpend } from './llm-usage';
import type { Permission } from './permissions';

/**
 * The kinds of analytics events we record.
 *
 * The first four are traffic/product events. The rest are **funnel boundaries**
 * (see `funnel.ts`): the append-only record of a user crossing a step, which is
 * what makes the activation rate measurable going forward even after the project
 * or its share link is deleted. `generate` already marks the artifact step, so it
 * is not duplicated here.
 */
export type AnalyticsEventType =
  | 'pageview'
  | 'signup'
  | 'login'
  | 'generate'
  | 'interview_started'
  | 'interview_confirmed'
  | 'share_created'
  | 'share_viewed'
  | 'export';

/**
 * The subset that marks a funnel boundary. `AdminService` reads the earliest of
 * these to report `measurableFrom` — the point before which the event-only steps
 * genuinely have no data.
 */
export const FUNNEL_EVENT_TYPES: readonly AnalyticsEventType[] = [
  'interview_started',
  'interview_confirmed',
  'generate',
  'share_created',
  'share_viewed',
  'export',
];

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
  /** Profile picture (data URI or provider URL), or null → initials fallback. */
  avatarUrl: string | null;
  role: AccountRole;
  /** RBAC role keys assigned to the user (for the roles column + editor). */
  roles: string[];
  emailVerified: boolean;
  providers: AuthProvider[];
  plan: SubscriptionPlan;
  projectCount: number;
  createdAt: string;
  /**
   * Lifetime AI spend attributable to this user — what they cost us in model
   * calls, next to what they pay us (`plan`).
   *
   * `null` when the caller does NOT hold `admin:analytics`. Spend is an analytics
   * question; a role granted only `admin:users:read` runs the user directory and
   * must not be handed the cost book as a side effect. (This is the mirror image
   * of the rule on `AdminLlmUsage.topUsers`, where a caller without
   * `admin:users:read` sees spend but not the emails behind it.)
   */
  aiSpend: UserAiSpend | null;
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

/** Traffic detail: daily series + top pages/referrers/countries. */
export interface AdminTraffic {
  pageviews: TimePoint[];
  uniqueVisitors: TimePoint[];
  topPages: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  /** Top visitor countries (ISO-3166-1 alpha-2) by pageviews. */
  topCountries: { country: string; count: number }[];
  totals: { pageviews: number; uniqueVisitors: number };
}
