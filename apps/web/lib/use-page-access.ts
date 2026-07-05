'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  hasPermission,
  isStaffUser,
  type AuthUser,
  type Permission,
} from '@archivato/shared';
import { authApi } from '@/lib/api';

/**
 * Client-side page guard. Fetches the current user, then asks `redirectFor`
 * where (if anywhere) to send them. Returns the user once allowed, or `null`
 * while checking / redirecting — so a page can `if (!user) return null` and
 * never render content the visitor isn't allowed to see.
 *
 * This is a UX guard only: every protected API is independently permission-gated
 * on the server, so a direct URL never leaks data. This just prevents rendering
 * (and flashing) a page the user can't use, and sends them somewhere sensible.
 */
export function usePageAccess(
  redirectFor: (me: AuthUser | null) => string | null,
): AuthUser | null {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((me) => {
        if (!active) return;
        const to = redirectFor(me);
        if (to) {
          router.replace(to);
          return;
        }
        setUser(me);
      })
      .catch(() => {
        if (active) router.replace('/dashboard');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return user;
}

/**
 * Guard factory for a permission-gated page. If the user lacks `permission`,
 * staff are sent to the dashboard and regular users to `userFallback` (defaults
 * to the dashboard). Use for the admin/staff consoles.
 */
export function requirePermission(
  permission: Permission,
  userFallback = '/dashboard',
): (me: AuthUser | null) => string | null {
  return (me) => {
    if (hasPermission(me?.permissions, permission)) return null;
    return isStaffUser(me?.permissions) ? '/dashboard' : userFallback;
  };
}

/**
 * Guard for the **customer** support area. Staff accounts are operators, not
 * customers: a support agent (holds `support:read_all`) is redirected to their
 * console, and any other staff (e.g. a Billing Admin) to the dashboard. Regular
 * users pass through.
 */
export function customerOnly(me: AuthUser | null): string | null {
  if (!me || !isStaffUser(me.permissions)) return null;
  return hasPermission(me.permissions, 'support:read_all')
    ? '/support/admin'
    : '/dashboard';
}
