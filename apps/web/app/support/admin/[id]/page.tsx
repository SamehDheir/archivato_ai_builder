'use client';

import { useParams } from 'next/navigation';
import { hasPermission } from '@archivato/shared';
import { TicketDetail } from '@/components/support/TicketDetail';
import { usePageAccess, requirePermission } from '@/lib/use-page-access';

/** Staff ticket detail — guards on `support:read_all` (staff without it → dashboard).
 *  Sidebar chrome comes from the AdminShell in app/support/admin/layout.tsx. */
export default function AdminTicketPage() {
  const params = useParams<{ id: string }>();
  const user = usePageAccess(requirePermission('support:read_all', '/support'));

  if (!user) return null;

  // Gate each control to the staff member's permissions — a "view all tickets"
  // role sees the ticket read-only; reply/manage/assign/note/copilot each unlock
  // with their permission (enforced server-side too).
  const caps = {
    reply: hasPermission(user.permissions, 'support:reply'),
    manage: hasPermission(user.permissions, 'support:manage'),
    assign: hasPermission(user.permissions, 'support:assign'),
    note: hasPermission(user.permissions, 'support:note'),
    copilot: hasPermission(user.permissions, 'support:copilot'),
  };

  return <TicketDetail ticketId={params.id} admin caps={caps} />;
}
