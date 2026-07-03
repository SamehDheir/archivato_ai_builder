'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsApi } from '@/lib/api';

/**
 * Fires an anonymous pageview beacon on every route change (including the public
 * landing, so admin traffic charts capture non-signed-in visitors). Renders
 * nothing and never throws. The admin dashboard itself is excluded so viewing
 * analytics doesn't inflate them.
 */
export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    analyticsApi.track(
      pathname,
      typeof document !== 'undefined' ? document.referrer : undefined,
    );
  }, [pathname]);

  return null;
}
