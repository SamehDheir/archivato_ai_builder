import { AdminShell } from '@/components/admin/AdminShell';

/** Wraps every platform-admin console (/admin, /admin/roles, /admin/billing) in
 *  the unified, permission-aware sidebar shell. Pages still self-guard. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
