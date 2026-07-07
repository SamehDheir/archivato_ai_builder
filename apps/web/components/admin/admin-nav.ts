import {
  BarChart3,
  BookMarked,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { hasPermission, type Permission } from '@archivato/shared';

/**
 * The staff/admin console navigation model — a single source of truth for the
 * sidebar (`AdminShell`) and the staff overview (`AdminOverview`). Each item is
 * gated by a permission; a `null` permission means "any staff member" (the
 * overview). Groups render only when at least one of their items is visible, so
 * the nav is always the union of what the viewer's roles grant.
 */
export interface AdminNavItem {
  key: string;
  href: string;
  /** i18n key under the `admin` namespace: `nav.<labelKey>`. */
  labelKey: string;
  icon: LucideIcon;
  /** Required permission, or `null` for every staff member. */
  permission: Permission | null;
}

export interface AdminNavGroup {
  key: string;
  /** i18n key under the `admin` namespace: `nav.group.<groupKey>`. */
  labelKey: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    key: 'general',
    labelKey: 'general',
    items: [
      {
        key: 'overview',
        href: '/dashboard',
        labelKey: 'overview',
        icon: LayoutDashboard,
        permission: null,
      },
    ],
  },
  {
    key: 'support',
    labelKey: 'support',
    items: [
      {
        key: 'tickets',
        href: '/support/admin',
        labelKey: 'tickets',
        icon: LifeBuoy,
        permission: 'support:read_all',
      },
      {
        key: 'kb',
        href: '/support/admin/kb',
        labelKey: 'kb',
        icon: BookMarked,
        permission: 'support:kb:manage',
      },
    ],
  },
  {
    key: 'platform',
    labelKey: 'platform',
    items: [
      {
        key: 'analytics',
        href: '/admin',
        labelKey: 'analytics',
        icon: BarChart3,
        permission: 'admin:analytics',
      },
      {
        key: 'roles',
        href: '/admin/roles',
        labelKey: 'roles',
        icon: Shield,
        permission: 'admin:roles:manage',
      },
    ],
  },
  {
    key: 'billing',
    labelKey: 'billing',
    items: [
      {
        key: 'billing',
        href: '/admin/billing',
        labelKey: 'billing',
        icon: CreditCard,
        permission: 'billing:manage',
      },
    ],
  },
] as const;

/** All nav items flattened (for overview cards / active resolution). */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = ADMIN_NAV.flatMap(
  (g) => g.items,
);

function itemVisible(
  item: AdminNavItem,
  permissions: readonly Permission[] | undefined,
): boolean {
  return item.permission === null || hasPermission(permissions, item.permission);
}

/** The nav groups (with only the visible items) the viewer may see. */
export function visibleNav(
  permissions: readonly Permission[] | undefined,
): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => itemVisible(i, permissions)),
  })).filter((g) => g.items.length > 0);
}

/**
 * The active item's key for a pathname — the item whose href is the **longest**
 * prefix of the path (so `/support/admin/kb` beats `/support/admin`, and
 * `/admin/roles` beats `/admin`). `/dashboard` matches exactly only.
 */
export function activeNavKey(pathname: string): string | null {
  let best: { key: string; len: number } | null = null;
  for (const item of ADMIN_NAV_ITEMS) {
    const matches =
      item.href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.len)) {
      best = { key: item.key, len: item.href.length };
    }
  }
  return best?.key ?? null;
}
