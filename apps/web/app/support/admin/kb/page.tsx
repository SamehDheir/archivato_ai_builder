'use client';

import { hasPermission } from '@archivato/shared';
import { SupportNav } from '@/components/support/SupportNav';
import { KbManager } from '@/components/support/KbManager';
import { usePageAccess, requirePermission } from '@/lib/use-page-access';

/**
 * Knowledge Base management console — gated on `support:kb:manage`. Staff
 * without it are redirected (to their support console or the dashboard); every
 * KB write is independently permission-checked server-side.
 */
export default function KbAdminPage() {
  const user = usePageAccess(
    requirePermission('support:kb:manage', '/support'),
  );
  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <SupportNav
        canManageSupport={hasPermission(user.permissions, 'support:read_all')}
        canManageKb
      />
      <KbManager />
    </div>
  );
}
