'use client';

import { KbManager } from '@/components/support/KbManager';
import { usePageAccess, requirePermission } from '@/lib/use-page-access';

/**
 * Knowledge Base management console — gated on `support:kb:manage`. Staff
 * without it are redirected; every KB write is independently permission-checked
 * server-side. Chrome comes from the AdminShell in the support/admin layout.
 */
export default function KbAdminPage() {
  const user = usePageAccess(requirePermission('support:kb:manage', '/support'));
  if (!user) return null;

  return <KbManager />;
}
