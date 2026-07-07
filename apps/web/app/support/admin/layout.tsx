import { AdminShell } from '@/components/admin/AdminShell';

/** Wraps the staff Support consoles (/support/admin, …/kb, …/[id]) in the same
 *  unified sidebar shell as the platform-admin consoles. Pages still self-guard. */
export default function SupportAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
