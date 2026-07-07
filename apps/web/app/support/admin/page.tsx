'use client';

import { hasPermission } from '@archivato/shared';
import { SupportNav } from '@/components/support/SupportNav';
import { AdminSupportDashboard } from '@/components/support/AdminSupportDashboard';
import { usePageAccess, requirePermission } from '@/lib/use-page-access';

/** Support staff panel — guards on `support:read_all` (staff without it → dashboard). */
export default function SupportAdminPage() {
  const user = usePageAccess(requirePermission('support:read_all', '/support'));
  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SupportNav
        canManageSupport
        canManageKb={hasPermission(user.permissions, 'support:kb:manage')}
      />
      <AdminSupportDashboard />
    </div>
  );
}
