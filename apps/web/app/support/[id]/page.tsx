'use client';

import { useParams } from 'next/navigation';
import { hasPermission } from '@archivato/shared';
import { SupportNav } from '@/components/support/SupportNav';
import { TicketDetail } from '@/components/support/TicketDetail';
import { usePageAccess, customerOnly } from '@/lib/use-page-access';

export default function TicketPage() {
  const params = useParams<{ id: string }>();
  const user = usePageAccess(customerOnly);
  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SupportNav canManageSupport={hasPermission(user.permissions, 'support:read_all')} />
      <TicketDetail ticketId={params.id} admin={false} />
    </div>
  );
}
