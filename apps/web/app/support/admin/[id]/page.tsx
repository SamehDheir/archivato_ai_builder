'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { SupportNav } from '@/components/support/SupportNav';
import { TicketDetail } from '@/components/support/TicketDetail';

/** Admin ticket detail — self-guards (non-admins bounce to the app). */
export default function AdminTicketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    authApi.me().then((me) => {
      if (!me || me.role !== 'admin') {
        router.replace('/support');
        return;
      }
      setUser(me);
    });
  }, [router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SupportNav isAdmin />
      <TicketDetail ticketId={params.id} admin />
    </div>
  );
}
