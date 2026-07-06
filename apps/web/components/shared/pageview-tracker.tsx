'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsApi } from '@/lib/api';
import { analyticsAllowed, onConsentChange } from '@/lib/consent';

/**
 * Fires an anonymous pageview beacon on every route change (including the public
 * landing, so admin traffic charts capture non-signed-in visitors). Renders
 * nothing and never throws. The admin dashboard itself is excluded so viewing
 * analytics doesn't inflate them.
 *
 * The beacon (and its visitor cookie) only fire once the visitor has ACCEPTED
 * analytics cookies — see `lib/consent.ts`. When consent is granted we re-run so
 * the current page is captured immediately, no reload needed.
 */
export function PageviewTracker() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(analyticsAllowed());
    return onConsentChange((v) => setAllowed(v === 'accepted'));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    if (!pathname || pathname.startsWith('/admin')) return;
    analyticsApi.track(
      pathname,
      typeof document !== 'undefined' ? document.referrer : undefined,
    );
  }, [pathname, allowed]);

  return null;
}
