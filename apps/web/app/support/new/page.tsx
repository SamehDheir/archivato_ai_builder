'use client';

import { useEffect, useState } from 'react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { SupportNav } from '@/components/support/SupportNav';
import { CreateTicket } from '@/components/support/CreateTicket';

export default function NewTicketPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    authApi.me().then(setUser).catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <SupportNav isAdmin={user?.role === 'admin'} />
      <CreateTicket />
    </div>
  );
}
