'use client';

import { hasPermission } from '@archivato/shared';
import { SupportNav } from '@/components/support/SupportNav';
import { CreateTicket } from '@/components/support/CreateTicket';
import { usePageAccess, customerOnly } from '@/lib/use-page-access';

export default function NewTicketPage() {
  const user = usePageAccess(customerOnly);
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <SupportNav canManageSupport={hasPermission(user.permissions, 'support:read_all')} />
      <CreateTicket />
    </div>
  );
}
