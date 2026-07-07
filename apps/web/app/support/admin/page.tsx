'use client';

import { AdminSupportDashboard } from '@/components/support/AdminSupportDashboard';
import { usePageAccess, requirePermission } from '@/lib/use-page-access';

/** Support staff panel — guards on `support:read_all` (staff without it → dashboard).
 *  Chrome (sidebar) comes from the AdminShell in app/support/admin/layout.tsx. */
export default function SupportAdminPage() {
  const user = usePageAccess(requirePermission('support:read_all', '/support'));
  if (!user) return null;

  return <AdminSupportDashboard />;
}
