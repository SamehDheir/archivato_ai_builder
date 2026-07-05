'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { hasPermission, type AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { SupportNav } from '@/components/support/SupportNav';
import { TicketDetail } from '@/components/support/TicketDetail';

export default function TicketPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    authApi.me().then(setUser).catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SupportNav canManageSupport={hasPermission(user?.permissions, 'support:read_all')} />
      <TicketDetail ticketId={params.id} admin={false} />
    </div>
  );
}
