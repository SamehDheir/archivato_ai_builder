'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { redactSharePath } from '@archivato/shared';
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
    // A share token is a bearer credential — never beacon it (see
    // `redactSharePath`). The API redacts again on receipt; both ends share the
    // one rule so they cannot drift apart.
    analyticsApi.track(
      redactSharePath(pathname),
      typeof document !== 'undefined' ? document.referrer : undefined,
    );
  }, [pathname, allowed]);

  return null;
}
